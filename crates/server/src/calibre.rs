use std::path::{Path, PathBuf};

use readingroom_core::{
    error::{AppError, Result},
    models::*,
    traits::MetadataSource,
};
use serde::Serialize;

use crate::db;

#[derive(Serialize)]
pub struct CalibreImportResult {
    pub total_found: usize,
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

pub struct CalibreImporter {
    db: sqlx::SqlitePool,
    library_root: Option<PathBuf>,
    metadata: Box<dyn MetadataSource>,
}

#[derive(sqlx::FromRow)]
struct CalibreBookRow {
    id: i64,
    title: String,
    isbn: Option<String>,
    path: String,
    pubdate: Option<String>,
}

#[derive(sqlx::FromRow)]
struct CalibreDataRow {
    name: String,
    format: String,
}

impl CalibreImporter {
    pub fn new(
        db: sqlx::SqlitePool,
        library_root: Option<PathBuf>,
        metadata: Box<dyn MetadataSource>,
    ) -> Self {
        Self {
            db,
            library_root,
            metadata,
        }
    }

    pub async fn import_calibre_library(
        &self,
        calibre_path: &Path,
        copy_files: bool,
    ) -> Result<CalibreImportResult> {
        let mut result = CalibreImportResult {
            total_found: 0,
            imported: 0,
            skipped: 0,
            errors: Vec::new(),
        };

        let db_path = calibre_path.join("metadata.db");
        if !db_path.exists() {
            return Err(AppError::NotFound(format!(
                "Calibre metadata.db not found at {}",
                db_path.display()
            )));
        }

        let url = format!("sqlite://{}", db_path.display());
        let calibre_db = sqlx::sqlite::SqlitePoolOptions::new()
            .connect(&url)
            .await?;

        let books = sqlx::query_as::<_, CalibreBookRow>(
            "SELECT id, title, isbn, path, pubdate FROM books ORDER BY id",
        )
        .fetch_all(&calibre_db)
        .await?;

        result.total_found = books.len();

        for book in &books {
            let (imported, file_errors) =
                match self.import_book(&calibre_db, calibre_path, book, copy_files).await
                {
                    Ok(r) => r,
                    Err(e) => {
                        result
                            .errors
                            .push(format!("Book {} ({}): {}", book.id, book.title, e));
                        continue;
                    }
                };

            if imported {
                result.imported += 1;
            } else {
                result.skipped += 1;
            }
            result.errors.extend(
                file_errors
                    .into_iter()
                    .map(|e| format!("Book {} ({}): {}", book.id, book.title, e)),
            );
        }

        Ok(result)
    }

    async fn import_book(
        &self,
        calibre_db: &sqlx::SqlitePool,
        calibre_path: &Path,
        book: &CalibreBookRow,
        copy_files: bool,
    ) -> Result<(bool, Vec<String>)> {
        let author_names: Vec<(String,)> = sqlx::query_as(
            "SELECT a.name FROM authors a
             JOIN books_authors_link bal ON bal.author = a.id
             WHERE bal.book = ?1",
        )
        .bind(book.id)
        .fetch_all(calibre_db)
        .await?;

        let data_files: Vec<CalibreDataRow> = sqlx::query_as(
            "SELECT name, format FROM data WHERE book = ?1",
        )
        .bind(book.id)
        .fetch_all(calibre_db)
        .await?;

        if data_files.is_empty() {
            return Ok((false, vec!["No data files found in Calibre DB".into()]));
        }

        let tags: Vec<String> = sqlx::query_scalar(
            "SELECT t.name FROM tags t
             JOIN books_tags_link btl ON btl.tag = t.id
             WHERE btl.book = ?1",
        )
        .bind(book.id)
        .fetch_all(calibre_db)
        .await?;

        let foreign_id = format!("calibre-{}", book.id);
        if db::find_book_by_foreign_id(&self.db, &foreign_id)
            .await?
            .is_some()
        {
            return Ok((false, Vec::new()));
        }

        if let Some(ref isbn) = book.isbn {
            let clean = isbn.trim();
            if !clean.is_empty() {
                let exists: bool = sqlx::query_scalar(
                    "SELECT COUNT(*) > 0 FROM books WHERE isbn = ?1 OR isbn13 = ?1",
                )
                .bind(clean)
                .fetch_one(&self.db)
                .await?;
                if exists {
                    return Ok((false, Vec::new()));
                }
            }
        }

        let author_name = author_names
            .first()
            .map(|a| a.0.clone())
            .unwrap_or_else(|| "Unknown Author".to_string());
        let author_id = self.resolve_author(&author_name).await?;

        let book_id = db::insert_book(
            &self.db,
            &foreign_id,
            author_id,
            &book.title,
            &book.title.to_lowercase(),
        )
        .await?;

        if let Some(ref isbn) = book.isbn {
            let clean = isbn.trim();
            if !clean.is_empty() {
                let _ = sqlx::query("UPDATE books SET isbn = ?1 WHERE id = ?2")
                    .bind(clean)
                    .bind(book_id)
                    .execute(&self.db)
                    .await;
            }
        }

        if let Some(ref pubdate) = book.pubdate {
            if let Some(date_str) = parse_calibre_date(pubdate) {
                let _ = sqlx::query("UPDATE books SET publish_date = ?1 WHERE id = ?2")
                    .bind(&date_str)
                    .bind(book_id)
                    .execute(&self.db)
                    .await;
            }
        }

        if !tags.is_empty() {
            let genres_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());
            let _ = sqlx::query("UPDATE books SET genres = ?1 WHERE id = ?2")
                .bind(&genres_json)
                .bind(book_id)
                .execute(&self.db)
                .await;
        }

        let mut file_errors = Vec::new();

        for data in &data_files {
            let format_lower = data.format.to_lowercase();

            let (format_name, quality) = crate::import::classify_file(&format_lower);

            let edition_format = match format_name.as_str() {
                "mp3" | "m4b" | "flac" | "m4a" | "aac" | "ogg" | "opus" | "wma" => {
                    EditionFormat::AudioBook
                }
                _ => EditionFormat::EBook,
            };

            let edition_id = db::insert_edition(
                &self.db,
                book_id,
                &format!("calibre-{}-{}-{}", book.id, data.name, format_lower),
                &book.title,
                "en",
                &format!("{:?}", edition_format).to_lowercase(),
                &quality,
            )
            .await?;

            let file_path = match self.find_data_file(calibre_path, book, data) {
                Some(p) => p,
                None => {
                    file_errors.push(format!(
                        "File not found on disk: {}.{}",
                        data.name, format_lower
                    ));
                    continue;
                }
            };

            let dest = if copy_files {
                let root = self
                    .library_root
                    .as_deref()
                    .unwrap_or_else(|| Path::new("library"));
                let filename = format!("book-{book_id}.{format_lower}");
                let dest = root.join("books").join(&filename);
                if let Some(parent) = dest.parent() {
                    tokio::fs::create_dir_all(parent).await?;
                }
                tokio::fs::copy(&file_path, &dest).await?;
                dest
            } else {
                file_path
            };

            let file_size = tokio::fs::metadata(&dest).await?.len();
            db::insert_book_file(
                &self.db,
                edition_id,
                &dest.to_string_lossy(),
                file_size as i64,
                &format!("{:?}", quality),
                &format_name,
            )
            .await?;
        }

        db::insert_history(
            &self.db,
            "calibre_import",
            &book.title,
            Some(book_id),
            0,
        )
        .await?;

        tracing::info!(book_id = book.id, title = %book.title, "Calibre imported book");

        Ok((true, file_errors))
    }

    fn find_data_file(
        &self,
        calibre_path: &Path,
        book: &CalibreBookRow,
        data: &CalibreDataRow,
    ) -> Option<PathBuf> {
        let format_lower = data.format.to_lowercase();
        let base = calibre_path.join(&book.path);

        let attempts = [
            base.join(format!("{}.{}", data.name, format_lower)),
            base.join(format!("{}.{}", data.name, data.format)),
            base.join(format!("{} - {}.{}", book.title, data.name, format_lower)),
        ];

        for p in &attempts {
            if p.exists() {
                return Some(p.clone());
            }
        }

        None
    }

    async fn resolve_author(&self, name: &str) -> Result<i64> {
        let authors = self.metadata.search_author(name).await?;
        if let Some(author) = authors.first() {
            if let Some(existing) =
                db::find_author_by_foreign_id(&self.db, &author.foreign_id).await?
            {
                return Ok(existing.id);
            }
            let author_id =
                db::insert_author(&self.db, &author.foreign_id, &author.name).await?;
            return Ok(author_id);
        }

        let fallback_id = format!("calibre-{}", name.replace(' ', "-").to_lowercase());
        if let Some(existing) =
            db::find_author_by_foreign_id(&self.db, &fallback_id).await?
        {
            return Ok(existing.id);
        }
        let author_id = db::insert_author(&self.db, &fallback_id, name).await?;
        Ok(author_id)
    }
}

fn parse_calibre_date(s: &str) -> Option<String> {
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S%z") {
        return Some(dt.format("%Y-%m-%d").to_string());
    }
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Some(dt.format("%Y-%m-%d").to_string());
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(d.format("%Y-%m-%d").to_string());
    }
    None
}
