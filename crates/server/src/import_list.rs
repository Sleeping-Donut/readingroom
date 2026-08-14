use std::path::PathBuf;

use readingroom_core::error::{AppError, Result};
use readingroom_core::traits::MetadataSource;

use crate::db;

#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct ImportListRow {
    pub id: i64,
    pub name: String,
    pub implementation: String,
    pub settings: String,
    pub enabled: bool,
    pub root_folder: Option<String>,
    pub monitor: bool,
    pub quality_profile: Option<String>,
    pub created_at: String,
}

pub struct ImportListManager {
    db: sqlx::SqlitePool,
    metadata: Box<dyn MetadataSource>,
}

impl ImportListManager {
    pub fn new(db: sqlx::SqlitePool, metadata: Box<dyn MetadataSource>) -> Self {
        Self { db, metadata }
    }

    pub async fn sync_all(&self) -> Result<()> {
        let lists = self.load_enabled().await?;
        for list in lists {
            match list.implementation.as_str() {
                "csv" => {
                    if let Err(e) = self.sync_csv(&list).await {
                        tracing::error!(
                            list = %list.name,
                            error = %e,
                            "Import list sync failed"
                        );
                    }
                }
                _ => tracing::warn!(impl_type = %list.implementation, "Unknown import list type"),
            }
        }
        Ok(())
    }

    pub async fn sync_list(&self, list_id: i64) -> Result<()> {
        let list = sqlx::query_as::<_, ImportListRow>(
            "SELECT id, name, implementation, settings, enabled, root_folder, monitor, quality_profile, created_at
             FROM import_lists WHERE id = ?1",
        )
        .bind(list_id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Import list not found".into()))?;

        match list.implementation.as_str() {
            "csv" => self.sync_csv(&list).await,
            _ => Err(AppError::Other(format!("Unknown import list type: {}", list.implementation))),
        }
    }

    async fn load_enabled(&self) -> Result<Vec<ImportListRow>> {
        let rows = sqlx::query_as::<_, ImportListRow>(
            "SELECT id, name, implementation, settings, enabled, root_folder, monitor, quality_profile, created_at
             FROM import_lists WHERE enabled = 1",
        )
        .fetch_all(&self.db)
        .await?;
        Ok(rows)
    }

    async fn sync_csv(&self, list: &ImportListRow) -> Result<()> {
        let settings: serde_json::Value = serde_json::from_str(&list.settings)
            .map_err(|e| AppError::Other(format!("Invalid settings JSON: {e}")))?;

        let file_path = settings
            .get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Other("CSV import list missing 'file_path' setting".into()))?;

        let path = if let Some(root) = &list.root_folder {
            PathBuf::from(root).join(file_path)
        } else {
            PathBuf::from(file_path)
        };

        if !path.exists() {
            return Err(AppError::Other(format!("CSV file not found: {}", path.display())));
        }

        let mut rdr = csv::ReaderBuilder::new()
            .flexible(true)
            .trim(csv::Trim::All)
            .from_path(&path)
            .map_err(|e| AppError::Other(format!("Failed to read CSV: {e}")))?;

        let headers = rdr
            .headers()
            .map_err(|e| AppError::Other(format!("Failed to read CSV headers: {e}")))?
            .clone();

        let title_idx = find_column(&headers, "Title")?;
        let author_idx = find_column(&headers, "Author")?;
        let isbn13_idx = find_column(&headers, "ISBN13").ok();
        let isbn_idx = find_column(&headers, "ISBN").ok();
        let shelf_idx = find_column(&headers, "Exclusive Shelf").ok();

        let skip_read = settings
            .get("skip_read_shelf")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        let mut imported = 0u64;
        let mut skipped = 0u64;

        for result in rdr.records() {
            let record = match result {
                Ok(r) => r,
                Err(e) => {
                    tracing::warn!(error = %e, "Skipping bad CSV record");
                    continue;
                }
            };

            let title = record.get(title_idx).unwrap_or("");
            let author = record.get(author_idx).unwrap_or("");

            if title.is_empty() || author.is_empty() {
                continue;
            }

            let isbn13 = isbn13_idx
                .and_then(|i| record.get(i))
                .filter(|s| !s.is_empty())
                .unwrap_or("");
            let isbn = isbn_idx
                .and_then(|i| record.get(i))
                .filter(|s| !s.is_empty())
                .unwrap_or("");
            let shelf = shelf_idx.and_then(|i| record.get(i)).unwrap_or("");

            if skip_read && shelf.eq_ignore_ascii_case("read") {
                skipped += 1;
                continue;
            }

            let foreign_id = if !isbn13.is_empty() { isbn13 } else { isbn };

            if !foreign_id.is_empty() {
                let excluded: bool = sqlx::query_scalar(
                    "SELECT COUNT(*) > 0 FROM import_list_exclusions WHERE foreign_id = ?1",
                )
                .bind(foreign_id)
                .fetch_one(&self.db)
                .await
                .unwrap_or(false);

                if excluded {
                    skipped += 1;
                    continue;
                }
            }

            // Use first author only (GoodReads CSV may have comma-separated co-authors)
            let primary_author = author.split(',').next().map(|s| s.trim()).unwrap_or(author);

            if let Some(book_id) = self
                .find_existing_book(isbn13, isbn, title)
                .await?
            {
                if list.monitor {
                    let _ = db::update_book_monitored(&self.db, book_id, true).await;
                }
                imported += 1;
                continue;
            }

            let result = self
                .lookup_and_import(isbn13, isbn, title, primary_author, list.monitor)
                .await;

            match result {
                Ok(Some(_book_id)) => {
                    imported += 1;
                    if !foreign_id.is_empty() {
                        let _ = sqlx::query(
                            "INSERT OR IGNORE INTO import_list_exclusions (foreign_id, name) VALUES (?1, ?2)",
                        )
                        .bind(foreign_id)
                        .bind(title)
                        .execute(&self.db)
                        .await;
                    }
                }
                Ok(None) => {
                    tracing::warn!(title = %title, author = %author, "Book not found on metadata source");
                    skipped += 1;
                }
                Err(e) => {
                    tracing::error!(title = %title, author = %author, error = %e, "Failed to import book");
                    skipped += 1;
                }
            }
        }

        tracing::info!(
            list = %list.name,
            imported,
            skipped,
            "CSV import completed"
        );

        Ok(())
    }

    async fn find_existing_book(
        &self,
        isbn13: &str,
        isbn: &str,
        title: &str,
    ) -> Result<Option<i64>> {
        if !isbn13.is_empty() {
            if let Some(id) =
                sqlx::query_scalar::<_, i64>("SELECT id FROM books WHERE isbn13 = ?1")
                    .bind(isbn13)
                    .fetch_optional(&self.db)
                    .await?
            {
                return Ok(Some(id));
            }
        }

        if !isbn.is_empty() {
            if let Some(id) =
                sqlx::query_scalar::<_, i64>("SELECT id FROM books WHERE isbn = ?1")
                    .bind(isbn)
                    .fetch_optional(&self.db)
                    .await?
            {
                return Ok(Some(id));
            }
        }

        let clean = title.to_lowercase();
        if let Some(id) =
            sqlx::query_scalar::<_, i64>("SELECT id FROM books WHERE clean_title = ?1")
                .bind(&clean)
                .fetch_optional(&self.db)
                .await?
        {
            return Ok(Some(id));
        }

        Ok(None)
    }

    async fn lookup_and_import(
        &self,
        isbn13: &str,
        isbn: &str,
        title: &str,
        author: &str,
        monitor: bool,
    ) -> Result<Option<i64>> {
        let query = if !isbn13.is_empty() {
            format!("isbn:{isbn13}")
        } else if !isbn.is_empty() {
            format!("isbn:{isbn}")
        } else {
            format!("{title} {author}")
        };

        let results = self.metadata.search_book(&query).await?;

        let matched = results.into_iter().find(|b| {
            if !isbn13.is_empty() {
                b.isbn13.as_deref() == Some(isbn13) || b.isbn.as_deref() == Some(isbn13)
            } else if !isbn.is_empty() {
                b.isbn.as_deref() == Some(isbn) || b.isbn13.as_deref() == Some(isbn)
            } else {
                true
            }
        });

        let ol_book = match matched {
            Some(b) => b,
            None => return Ok(None),
        };

        let author_id = self.find_or_create_author(author).await?;

        let clean_title = ol_book.title.to_lowercase();
        let book_id = db::insert_book(
            &self.db,
            &ol_book.foreign_id,
            author_id,
            &ol_book.title,
            &clean_title,
        )
        .await?;

        sqlx::query(
            "UPDATE books SET isbn = ?1, isbn13 = ?2, description = ?3,
             language = ?4, genres = ?5, image_url = ?6, publisher = ?7
             WHERE id = ?8",
        )
        .bind(&ol_book.isbn)
        .bind(&ol_book.isbn13)
        .bind(&ol_book.description)
        .bind(&ol_book.language)
        .bind(&serde_json::to_string(&ol_book.genres).unwrap_or_default())
        .bind(&ol_book.image_url)
        .bind(&ol_book.publisher)
        .bind(book_id)
        .execute(&self.db)
        .await?;

        if monitor {
            let _ = db::update_book_monitored(&self.db, book_id, true).await;
        }

        Ok(Some(book_id))
    }

    async fn find_or_create_author(&self, name: &str) -> Result<i64> {
        if let Some(id) =
            sqlx::query_scalar::<_, i64>("SELECT id FROM authors WHERE name = ?1")
                .bind(name)
                .fetch_optional(&self.db)
                .await?
        {
            return Ok(id);
        }

        let results = self.metadata.search_author(name).await?;
        if let Some(author) = results.into_iter().next() {
            let foreign_id = author.foreign_id.clone();
            if let Ok(existing) = db::find_author_by_foreign_id(&self.db, &foreign_id).await {
                if let Some(a) = existing {
                    return Ok(a.id);
                }
            }
            return Ok(db::insert_author(&self.db, &author.foreign_id, &author.name).await?);
        }

        Ok(db::insert_author(&self.db, "unknown", name).await?)
    }
}

fn find_column(headers: &csv::StringRecord, name: &str) -> std::result::Result<usize, AppError> {
    for (i, header) in headers.iter().enumerate() {
        let cleaned = header.trim_start_matches('\u{feff}');
        if cleaned.eq_ignore_ascii_case(name) {
            return Ok(i);
        }
    }
    Err(AppError::Other(format!("Column '{name}' not found in CSV headers: {:?}", headers.iter().collect::<Vec<_>>())))
}
