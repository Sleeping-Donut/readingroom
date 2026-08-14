use std::path::{Path, PathBuf};

use readingroom_core::{
    config::LibraryConfig,
    error::{AppError, Result},
    models::{CompletedDownload, EditionFormat, Quality},
    traits::{DownloadClient, DownloadId},
};

use crate::db;

/// Handles importing downloaded files into the library.
pub struct ImportManager {
    db: sqlx::SqlitePool,
    library_root: Option<PathBuf>,
    audiobook_root: Option<PathBuf>,
    library_config: LibraryConfig,
}

impl ImportManager {
    pub fn new(
        db: sqlx::SqlitePool,
        library_root: Option<PathBuf>,
        audiobook_root: Option<PathBuf>,
        library_config: LibraryConfig,
    ) -> Self {
        Self {
            db,
            library_root,
            audiobook_root,
            library_config,
        }
    }

    /// Import a completed download.
    /// Finds files in the download directory, determines format, and moves them to the library.
    pub async fn import_completed(
        &self,
        client: &dyn DownloadClient,
        completed: &CompletedDownload,
    ) -> Result<()> {
        let dl_path = client
            .get_download_path(&DownloadId(completed.download_id.clone()))
            .await?;
        let dl_path = Path::new(&dl_path);

        if !dl_path.exists() {
            tracing::warn!(path = %dl_path.display(), "Download path does not exist");
            return Err(AppError::NotFound(format!(
                "Download path not found: {}",
                dl_path.display()
            )));
        }

        // Scan for compatible files
        let files = self.scan_directory(dl_path)?;
        if files.is_empty() {
            tracing::warn!(path = %dl_path.display(), "No compatible files found in download");
            return Ok(());
        }

        for file_path in &files {
            let ext = file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            let (format_name, quality) = classify_file(&ext);
            let edition_id = match self
                .ensure_edition(completed.book_id, &format_name, &quality)
                .await
            {
                Ok(id) => id,
                Err(e) => {
                    tracing::warn!(error = %e, "Skipping file");
                    continue;
                }
            };

            let book_title = db::get_book_title(&self.db, completed.book_id)
                .await?
                .unwrap_or_else(|| "Unknown".into());

            // Build destination path
            let dest = self.destination_path(completed.book_id, &book_title, &format_name, &quality, file_path)?;
            if let Some(parent) = dest.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }

            // Copy (not move, to avoid issues with seeding)
            tokio::fs::copy(file_path, &dest).await?;
            tracing::info!(
                from = %file_path.display(),
                to = %dest.display(),
                "Imported file"
            );

            // Create book_file record
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

            // Write OPF metadata sidecar
            if let Ok(Some(book)) = crate::db::get_book_by_id(&self.db, completed.book_id).await {
                if let Err(e) = self.write_opf_metadata(&book, &dest).await {
                    tracing::warn!(book_id = %completed.book_id, error = %e, "Failed to write OPF metadata");
                }
            }
        }

        // Record history
        db::insert_history(
            &self.db,
            "imported",
            &dl_path.to_string_lossy(),
            Some(completed.book_id),
            completed.id,
        )
        .await?;

        tracing::info!(
            book_id = %completed.book_id,
            files = %files.len(),
            "Import completed"
        );

        Ok(())
    }

    /// Scan a directory recursively for ebook/audiobook files.
    /// First extracts any ZIP archives found, then scans for compatible files.
    fn scan_directory(&self, dir: &Path) -> Result<Vec<PathBuf>> {
        // Extract any ZIP archives in the download directory
        self.extract_archives(dir)?;

        let mut results = Vec::new();
        self.scan_dir_recursive(dir, &mut results)?;
        Ok(results)
    }

    /// Extract ZIP archives found in the given directory
    fn extract_archives(&self, dir: &Path) -> Result<()> {
        if !dir.is_dir() {
            return Ok(());
        }

        let entries: Vec<_> = std::fs::read_dir(dir)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
            })
            .collect();

        for entry in entries {
            let zip_path = entry.path();
            tracing::info!(path = %zip_path.display(), "Extracting ZIP archive");

            let file = match std::fs::File::open(&zip_path) {
                Ok(f) => f,
                Err(e) => {
                    tracing::warn!(path = %zip_path.display(), error = %e, "Failed to open ZIP");
                    continue;
                }
            };

            let mut archive = match zip::ZipArchive::new(file) {
                Ok(a) => a,
                Err(e) => {
                    tracing::warn!(path = %zip_path.display(), error = %e, "Failed to read ZIP");
                    continue;
                }
            };

            for i in 0..archive.len() {
                let mut inner = match archive.by_index(i) {
                    Ok(f) => f,
                    Err(e) => {
                        tracing::warn!(index = i, error = %e, "Failed to read ZIP entry");
                        continue;
                    }
                };

                let name = inner.name().to_string();
                let out_path = dir.join(&name);

                if inner.is_dir() {
                    let _ = std::fs::create_dir_all(&out_path);
                    continue;
                }

                if let Some(parent) = out_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }

                if let Err(e) = std::io::copy(&mut inner, &mut std::fs::File::create(&out_path)?) {
                    tracing::warn!(path = %name, error = %e, "Failed to extract ZIP entry");
                }
            }

            // Remove the ZIP file after extraction
            let _ = std::fs::remove_file(&zip_path);
        }

        Ok(())
    }

    fn scan_dir_recursive(&self, dir: &Path, results: &mut Vec<PathBuf>) -> Result<()> {
        if !dir.is_dir() {
            return Ok(());
        }

        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_dir() {
                self.scan_dir_recursive(&path, results)?;
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext = ext.to_lowercase();
                if matches!(
                    ext.as_str(),
                    "epub" | "mobi" | "azw3" | "pdf" | "mp3" | "m4b" | "flac" | "m4a" | "aac"
                        | "ogg" | "opus" | "wma" | "cue"
                ) {
                    results.push(path);
                }
            }
        }

        Ok(())
    }

    /// Ensure an edition exists for this book and format, creating one if needed.
    async fn ensure_edition(
        &self,
        book_id: i64,
        format_name: &str,
        quality: &Quality,
    ) -> Result<i64> {
        let book_title = db::get_book_title(&self.db, book_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Book not found".into()))?;

        let format = match format_name {
            "mp3" | "m4b" | "flac" | "m4a" | "aac" | "ogg" | "opus" | "wma" => {
                EditionFormat::AudioBook
            }
            "epub" | "mobi" | "azw3" | "pdf" => EditionFormat::EBook,
            other => return Err(AppError::Other(format!("Unknown format: {other}"))),
        };

        // Check for existing edition matching this quality
        // For now, always create a new edition per import
        let edition_id = db::insert_edition(
            &self.db,
            book_id,
            &format!("import-{}-{}", format_name, chrono::Utc::now().timestamp()),
            &book_title,
            "en",
            &format!("{:?}", format).to_lowercase(),
            quality,
        )
        .await?;

        Ok(edition_id)
    }

    /// Determine the destination path for an imported file using rename patterns.
    fn destination_path(
        &self,
        book_id: i64,
        book_title: &str,
        format_name: &str,
        quality: &Quality,
        source: &Path,
    ) -> Result<PathBuf> {
        let root = self
            .library_root
            .as_deref()
            .unwrap_or_else(|| Path::new("library"));

        let ext = source
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown");

        if self.library_config.rename_files {
            let fmt = self
                .library_config
                .book_file_format
                .as_deref()
                .unwrap_or("{book_id}.{ext}");

            let author_folder = self
                .library_config
                .author_folder_format
                .as_deref()
                .unwrap_or("{book_id}");

            let safe_title = book_title
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
                .collect::<String>()
                .trim()
                .to_string();

            let filename = fmt
                .replace("{book_id}", &book_id.to_string())
                .replace("{book_title}", &safe_title)
                .replace("{title}", &safe_title)
                .replace("{quality}", &format!("{:?}", quality))
                .replace("{format}", format_name)
                .replace("{ext}", ext);

            let author_dir = author_folder
                .replace("{book_id}", &book_id.to_string())
                .replace("{book_title}", &safe_title)
                .replace("{title}", &safe_title);

            let dest = root.join("books").join(&author_dir).join(&filename);
            Ok(dest)
        } else {
            let filename = format!("book-{book_id}.{ext}");
            let dest = root.join("books").join(&filename);
            Ok(dest)
        }
    }

    /// Write an OPF metadata sidecar file alongside an imported book file.
    async fn write_opf_metadata(&self, book: &readingroom_core::models::Book, dest: &Path) -> Result<()> {
        let author_name = sqlx::query_scalar::<_, String>(
            "SELECT name FROM authors WHERE id = ?1"
        )
        .bind(book.author_id)
        .fetch_optional(&self.db)
        .await?
        .unwrap_or_else(|| "Unknown Author".into());

        let opf_path = dest.with_extension("opf");

        let genres = book.genres.join(", ");
        let publish_date = book.publish_date.map(|d| d.to_string()).unwrap_or_default();
        let description = book.description.as_deref().unwrap_or("");
        let isbn = book.isbn.as_deref().unwrap_or("");
        let isbn13 = book.isbn13.as_deref().unwrap_or("");
        let publisher = book.publisher.as_deref().unwrap_or("");

        let opf_content = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="bookid">readingroom:book:{id}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:creator>{author}</dc:creator>
    <dc:language>{lang}</dc:language>
    <dc:date>{date}</dc:date>
    <dc:publisher>{pub}</dc:publisher>
    <dc:description>{desc}</dc:description>
    <dc:subject>{subjects}</dc:subject>
    <dc:identifier opf:scheme="ISBN">{isbn}</dc:identifier>
    <dc:identifier opf:scheme="ISBN">{isbn13}</dc:identifier>
  </metadata>
</package>
"#,
            id = book.id,
            title = book.title.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;"),
            author = author_name.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;"),
            lang = book.language,
            date = publish_date,
            pub = publisher.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;"),
            desc = description.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;"),
            subjects = genres.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;"),
            isbn = isbn,
            isbn13 = isbn13,
        );

        tokio::fs::write(&opf_path, opf_content.as_bytes()).await?;
        tracing::info!(path = %opf_path.display(), "Wrote OPF metadata");

        Ok(())
    }
}

/// Classify a file extension into format name and quality
pub(crate) fn classify_file(ext: &str) -> (String, Quality) {
    match ext {
        "epub" => ("epub".into(), Quality::EPUB),
        "mobi" => ("mobi".into(), Quality::MOBI),
        "azw3" => ("azw3".into(), Quality::AZW3),
        "pdf" => ("pdf".into(), Quality::PDF),
        "mp3" => ("mp3".into(), Quality::MP3),
        "m4b" | "m4a" => ("m4b".into(), Quality::M4B),
        "flac" => ("flac".into(), Quality::FLAC),
        _ => (ext.into(), Quality::Unknown),
    }
}
