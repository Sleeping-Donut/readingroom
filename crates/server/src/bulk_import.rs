use std::path::{Path, PathBuf};

use readingroom_core::{
    error::{AppError, Result},
    models::*,
    traits::MetadataSource,
};
use serde::Serialize;

use crate::db;

#[derive(Serialize)]
pub struct BulkImportResult {
    pub total_found: usize,
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

pub struct BulkImporter {
    db: sqlx::SqlitePool,
    metadata: Box<dyn MetadataSource>,
    library_root: Option<PathBuf>,
}

impl BulkImporter {
    pub fn new(
        db: sqlx::SqlitePool,
        metadata: Box<dyn MetadataSource>,
        library_root: Option<PathBuf>,
    ) -> Self {
        Self {
            db,
            metadata,
            library_root,
        }
    }

    pub async fn scan_directory(
        &self,
        dir: &Path,
        copy_files: bool,
    ) -> Result<BulkImportResult> {
        let mut result = BulkImportResult {
            total_found: 0,
            imported: 0,
            skipped: 0,
            errors: Vec::new(),
        };

        let files = self.collect_files(dir)?;
        result.total_found = files.len();

        for file_path in &files {
            let file_stem = file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let query = Self::stem_to_query(&file_stem);

            let search_results = match self.metadata.search_book(&query).await {
                Ok(books) => books,
                Err(e) => {
                    result.errors.push(format!(
                        "{}: search failed: {}",
                        file_path.display(),
                        e
                    ));
                    continue;
                }
            };

            if search_results.is_empty() {
                result.skipped += 1;
                result.errors.push(format!(
                    "{}: no match found for query '{}'",
                    file_path.display(),
                    query
                ));
                continue;
            }

            let book = &search_results[0];

            match self
                .add_book_to_library(book, file_path, copy_files)
                .await
            {
                Ok(_) => result.imported += 1,
                Err(e) => {
                    result.errors.push(format!(
                        "{}: import failed: {}",
                        file_path.display(),
                        e
                    ));
                }
            }
        }

        Ok(result)
    }

    fn collect_files(&self, dir: &Path) -> Result<Vec<PathBuf>> {
        let mut results = Vec::new();
        self.collect_recursive(dir, &mut results)?;
        Ok(results)
    }

    fn collect_recursive(&self, dir: &Path, results: &mut Vec<PathBuf>) -> Result<()> {
        if !dir.is_dir() {
            return Ok(());
        }
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                self.collect_recursive(&path, results)?;
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext = ext.to_lowercase();
                if matches!(
                    ext.as_str(),
                    "epub" | "mobi" | "azw3" | "pdf" | "mp3" | "m4b" | "flac" | "m4a"
                        | "aac" | "ogg" | "opus" | "wma" | "cue"
                ) {
                    results.push(path);
                }
            }
        }
        Ok(())
    }

    fn stem_to_query(stem: &str) -> String {
        let cleaned = stem
            .replace('_', " ")
            .replace('.', " ")
            .replace('-', " ")
            .replace('(', " ")
            .replace(')', " ")
            .replace('[', " ")
            .replace(']', " ");

        let noise_words = [
            "retail",
            "epub",
            "mobi",
            "pdf",
            "azw3",
            "mp3",
            "m4b",
            "flac",
            "aac",
            "ogg",
            "opus",
            "wma",
            "v1",
            "v2",
            "final",
            "fixed",
            "repack",
            "proper",
            "ebook",
            "audiobook",
            "unabridged",
        ];

        let words: Vec<&str> = cleaned
            .split_whitespace()
            .filter(|w| !noise_words.contains(&w.to_lowercase().as_str()))
            .collect();

        let result = words.join(" ");
        if result.is_empty() {
            stem.to_string()
        } else {
            result
        }
    }

    async fn add_book_to_library(
        &self,
        book: &Book,
        source: &Path,
        copy: bool,
    ) -> Result<()> {
        if db::find_book_by_foreign_id(&self.db, &book.foreign_id)
            .await?
            .is_some()
        {
            return Ok(());
        }

        let full_book = self.metadata.get_book(&book.foreign_id).await?;

        let author_id = self.resolve_author(&book.foreign_id).await?;

        let book_id = db::insert_book(
            &self.db,
            &full_book.foreign_id,
            author_id,
            &full_book.title,
            &full_book.clean_title,
        )
        .await?;

        let ext = source
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let (format_name, quality) = crate::import::classify_file(&ext);

        let format = match format_name.as_str() {
            "mp3" | "m4b" | "flac" | "m4a" | "aac" | "ogg" | "opus" | "wma" => {
                EditionFormat::AudioBook
            }
            "epub" | "mobi" | "azw3" | "pdf" => EditionFormat::EBook,
            other => return Err(AppError::Other(format!("Unknown format: {other}"))),
        };

        let edition_id = db::insert_edition(
            &self.db,
            book_id,
            &format!("bulk-{}-{}", format_name, chrono::Utc::now().timestamp()),
            &full_book.title,
            &full_book.language,
            &format!("{:?}", format).to_lowercase(),
            &quality,
        )
        .await?;

        let dest = if copy {
            let ext = source
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("unknown");
            let root = self
                .library_root
                .as_deref()
                .unwrap_or_else(|| Path::new("library"));
            let filename = format!("book-{book_id}.{ext}");
            let dest = root.join("books").join(&filename);
            if let Some(parent) = dest.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            tokio::fs::copy(source, &dest).await?;
            dest
        } else {
            source.to_path_buf()
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

        db::insert_history(
            &self.db,
            "bulk_import",
            &source.to_string_lossy(),
            Some(book_id),
            0,
        )
        .await?;

        tracing::info!(
            book_id = book_id,
            path = %source.display(),
            "Bulk imported book"
        );

        Ok(())
    }

    async fn resolve_author(&self, book_foreign_id: &str) -> Result<i64> {
        let clean_id = book_foreign_id
            .trim_start_matches('/')
            .strip_prefix("works/")
            .unwrap_or(book_foreign_id);
        let url = format!("https://openlibrary.org/works/{clean_id}.json");
        let client = reqwest::Client::new();
        let resp = client.get(&url).send().await?;
        let data: serde_json::Value = resp.json().await?;

        let author_key = data["authors"][0]["author"]["key"]
            .as_str()
            .and_then(|k| k.strip_prefix("/authors/"))
            .map(|k| k.to_string())
            .ok_or_else(|| AppError::Other("No author found for work".into()))?;

        if let Some(existing) =
            db::find_author_by_foreign_id(&self.db, &author_key).await?
        {
            return Ok(existing.id);
        }

        let author = self.metadata.get_author(&author_key).await?;
        let author_id =
            db::insert_author(&self.db, &author.foreign_id, &author.name).await?;
        Ok(author_id)
    }
}
