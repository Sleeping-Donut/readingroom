use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use readingroom_core::{
    config::LibraryConfig,
    error::{AppError, Result},
    models::{Book, CompletedDownload, EditionFormat, Quality},
    traits::{DownloadClient, DownloadId},
};
use serde::{Deserialize, Serialize};

use crate::db;

/// Result of trying to auto-import a completed download.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportOutcome {
    /// Every compatible file was imported automatically.
    Imported { files: usize },
    /// The download contains files that could not be mapped to the grabbed
    /// book; it is parked for manual import.
    Pending { candidates: usize },
}

/// How to transfer a file from the download folder into the library.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ImportMode {
    /// Move the file (frees the download).
    Move,
    /// Copy the file (leaves the download intact, e.g. for seeding).
    #[default]
    Copy,
    /// Hardlink when possible, otherwise copy.
    Hardlink,
}

/// A single file inside a completed download, with its proposed mapping.
#[derive(Debug, Clone, Serialize)]
pub struct ImportCandidate {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub format: String,
    pub quality: String,
    pub is_audiobook: bool,
    pub parsed_title: String,
    pub parsed_author: Option<String>,
    /// Proposed target book (null when no confident match was found).
    pub book_id: Option<i64>,
    pub book_title: Option<String>,
    /// Why this file cannot be imported as-is, if anything.
    pub rejection: Option<String>,
}

/// A user-resolved import instruction for one file.
#[derive(Debug, Clone, Deserialize)]
pub struct ImportItem {
    pub path: String,
    pub book_id: i64,
    #[serde(default)]
    pub quality: Option<String>,
}

/// Summary of a manual import run.
#[derive(Debug, Clone, Serialize, Default)]
pub struct ImportSummary {
    pub imported: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}


/// Handles importing downloaded files into the library.
pub struct ImportManager {
    db: sqlx::SqlitePool,
    library_config: LibraryConfig,
}

impl ImportManager {
    pub fn new(
        db: sqlx::SqlitePool,
        library_config: LibraryConfig,
    ) -> Self {
        Self {
            db,
            library_config,
        }
    }

    /// Load the effective library config: the startup (config.toml) seed merged
    /// with any runtime override stored in the `config` table (key "library"),
    /// so import uses the latest settings without a restart.
    async fn effective_library_config(&self) -> LibraryConfig {
        let mut cfg = self.library_config.clone();
        if let Ok(Some(json)) = db::get_config_value(&self.db, "library").await {
            if let Ok(overlay) = serde_json::from_str::<LibraryConfig>(&json) {
                cfg.merge_library(&overlay);
            }
        }
        cfg
    }

    /// Import a completed download.
    /// Finds files in the download directory, determines format, and copies them
    /// to the library. Downloads that clearly contain more than one book are
    /// parked (`ImportOutcome::Pending`) for manual import instead of being
    /// dumped onto the grabbed book.
    pub async fn import_completed(
        &self,
        client: &dyn DownloadClient,
        completed: &CompletedDownload,
    ) -> Result<ImportOutcome> {
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
            return Err(AppError::Other(format!(
                "No compatible files found in {}",
                dl_path.display()
            )));
        }

        // Phase 0 guardrail: don't blindly import a pack of books.
        if Self::looks_multi_book(&files) {
            tracing::warn!(
                path = %dl_path.display(),
                files = files.len(),
                "Multiple books detected; deferring to manual import"
            );
            return Ok(ImportOutcome::Pending {
                candidates: files.len(),
            });
        }

        let lib_cfg = self.effective_library_config().await;
        let author_name = db::get_book_author_name(&self.db, completed.book_id)
            .await?
            .unwrap_or_else(|| "Unknown".into());

        let mut imported = 0usize;
        for file_path in &files {
            match self
                .import_one(completed.book_id, file_path, &author_name, &lib_cfg, ImportMode::Copy, None)
                .await
            {
                Ok(()) => imported += 1,
                Err(e) => tracing::warn!(error = %e, "Skipping file"),
            }
        }

        if imported == 0 {
            return Err(AppError::Other(format!(
                "No files could be imported from {}",
                dl_path.display()
            )));
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

        db::set_book_status_have(&self.db, completed.book_id).await?;

        tracing::info!(
            book_id = %completed.book_id,
            files = %imported,
            "Import completed"
        );

        Ok(ImportOutcome::Imported { files: imported })
    }

    /// Import one file for a book: create the edition if needed, transfer the
    /// file into the library, and record the book_file row.
    async fn import_one(
        &self,
        book_id: i64,
        file_path: &Path,
        author_name: &str,
        cfg: &LibraryConfig,
        mode: ImportMode,
        quality_override: Option<Quality>,
    ) -> Result<()> {
        let ext = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let (format_name, classified) = classify_file(&ext);
        let quality = quality_override.unwrap_or(classified);
        if quality == Quality::Unknown {
            return Err(AppError::Other(format!("Unsupported format: {ext}")));
        }

        let edition_id = self.ensure_edition(book_id, &format_name, &quality).await?;
        let book_title = db::get_book_title(&self.db, book_id)
            .await?
            .unwrap_or_else(|| "Unknown".into());
        let is_audiobook = is_audiobook_format(&format_name);

        let dest = self.destination_path(
            book_id,
            &book_title,
            author_name,
            is_audiobook,
            &format_name,
            &quality,
            file_path,
            cfg,
        )?;

        self.transfer(file_path, &dest, mode).await?;
        tracing::info!(
            from = %file_path.display(),
            to = %dest.display(),
            ?mode,
            "Imported file"
        );

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

        if let Ok(Some(book)) = crate::db::get_book_by_id(&self.db, book_id).await {
            if let Err(e) = self.write_opf_metadata(&book, &dest).await {
                tracing::warn!(book_id = %book_id, error = %e, "Failed to write OPF metadata");
            }
        }

        Ok(())
    }

    /// Transfer a file into the library. `Move` frees the download, `Copy`
    /// leaves it intact (torrents keep seeding), `Hardlink` links when the
    /// library is on the same filesystem and otherwise falls back to copy.
    async fn transfer(&self, src: &Path, dest: &Path, mode: ImportMode) -> Result<()> {
        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        match mode {
            ImportMode::Move => {
                if tokio::fs::rename(src, dest).await.is_err() {
                    tokio::fs::copy(src, dest).await?;
                    tokio::fs::remove_file(src).await.ok();
                }
            }
            ImportMode::Copy => {
                tokio::fs::copy(src, dest).await?;
            }
            ImportMode::Hardlink => {
                if std::fs::hard_link(src, dest).is_err() {
                    tokio::fs::copy(src, dest).await?;
                }
            }
        }
        Ok(())
    }


    /// Whether the file set clearly spans more than one book (e.g. an author or
    /// series pack). Per-chapter audio files are ignored so a single audiobook
    /// with many tracks is not mistaken for a pack.
    fn looks_multi_book(files: &[PathBuf]) -> bool {
        let mut titles: BTreeSet<String> = BTreeSet::new();
        for path in files {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if matches!(ext.as_str(), "mp3" | "aac" | "ogg" | "opus" | "wma" | "cue") {
                continue;
            }
            if let Some(title) = parse_release_name(
                path.file_stem().and_then(|s| s.to_str()).unwrap_or(""),
            ) {
                titles.insert(normalize_title(&title));
            }
        }
        titles.len() >= 2
    }

    /// Scan a completed download and build one candidate per compatible file,
    /// proposing a target book by matching the parsed name against tracked books.
    pub async fn scan_candidates(
        &self,
        download_path: &str,
        default_book_id: Option<i64>,
    ) -> Result<Vec<ImportCandidate>> {
        let dl_path = Path::new(download_path);
        if !dl_path.exists() {
            return Err(AppError::NotFound(format!(
                "Download path not found: {download_path}"
            )));
        }
        let files = self.scan_directory(dl_path)?;
        let books = db::list_books(&self.db).await.unwrap_or_default();
        let multi = Self::looks_multi_book(&files);

        let mut candidates = Vec::with_capacity(files.len());
        for path in &files {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let (format_name, quality) = classify_file(&ext);
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let parsed_title = parse_release_name(stem).unwrap_or_else(|| stem.to_string());
            let parsed_author = parse_release_author(stem);

            let (book_id, book_title) = match best_book_match(&parsed_title, &books) {
                Some(b) => (Some(b.id), Some(b.title.clone())),
                // A single-book download keeps the grabbed book as the default.
                None if !multi => match default_book_id {
                    Some(id) => (Some(id), db::get_book_title(&self.db, id).await.unwrap_or(None)),
                    None => (None, None),
                },
                None => (None, None),
            };

            let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            let rejection = if quality == Quality::Unknown {
                Some(format!("Unsupported format: .{ext}"))
            } else if book_id.is_none() {
                Some("No matching book".into())
            } else if db::book_file_exists(&self.db, &path.to_string_lossy())
                .await
                .unwrap_or(false)
            {
                Some("Already imported".into())
            } else {
                None
            };

            let is_audiobook = is_audiobook_format(&format_name);
            candidates.push(ImportCandidate {
                path: path.to_string_lossy().to_string(),
                name: path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string(),
                size,
                format: format_name,
                quality: format!("{quality:?}"),
                is_audiobook,
                parsed_title,
                parsed_author,
                book_id,
                book_title,
                rejection,
            });
        }
        Ok(candidates)
    }

    /// Import a user-resolved set of candidates.
    pub async fn import_selected(
        &self,
        items: &[ImportItem],
        mode: ImportMode,
    ) -> Result<ImportSummary> {
        let cfg = self.effective_library_config().await;
        let mut summary = ImportSummary::default();
        let mut touched_books: BTreeSet<i64> = BTreeSet::new();

        for item in items {
            let src = Path::new(&item.path);
            if !src.exists() {
                summary.failed += 1;
                summary.errors.push(format!("File not found: {}", item.path));
                continue;
            }
            let author_name = db::get_book_author_name(&self.db, item.book_id)
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| "Unknown".into());
            let quality_override = item.quality.as_deref().and_then(quality_from_str);

            match self
                .import_one(item.book_id, src, &author_name, &cfg, mode, quality_override)
                .await
            {
                Ok(()) => {
                    summary.imported += 1;
                    touched_books.insert(item.book_id);
                }
                Err(e) => {
                    summary.failed += 1;
                    summary.errors.push(format!("{}: {e}", item.path));
                }
            }
        }

        for book_id in touched_books {
            let _ = db::set_book_status_have(&self.db, book_id).await;
        }
        Ok(summary)
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
        author_name: &str,
        is_audiobook: bool,
        format_name: &str,
        quality: &Quality,
        source: &Path,
        cfg: &LibraryConfig,
    ) -> Result<PathBuf> {
        let library_root = cfg
            .root_folder
            .as_deref()
            .unwrap_or_else(|| Path::new("library"));

        let root = if is_audiobook {
            cfg.audiobook_folder.as_deref().unwrap_or(library_root)
        } else {
            library_root
        };

        let subdir = if is_audiobook { "audiobooks" } else { "books" };

        let ext = source
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("unknown");

        if cfg.rename_files {
            let fmt = cfg
                .book_file_format
                .as_deref()
                .unwrap_or("{book_id}.{ext}");

            let author_folder = cfg
                .author_folder_format
                .as_deref()
                .unwrap_or("{book_id}");

            let safe_title = sanitize_name(book_title);
            let safe_author = sanitize_name(author_name);

            let filename = fmt
                .replace("{book_id}", &book_id.to_string())
                .replace("{book_title}", &safe_title)
                .replace("{title}", &safe_title)
                .replace("{author_name}", &safe_author)
                .replace("{quality}", &format!("{:?}", quality))
                .replace("{format}", format_name)
                .replace("{ext}", ext);

            let author_dir = author_folder
                .replace("{book_id}", &book_id.to_string())
                .replace("{book_title}", &safe_title)
                .replace("{title}", &safe_title)
                .replace("{author_name}", &safe_author);

            let dest = root.join(subdir).join(&author_dir).join(&filename);
            Ok(dest)
        } else {
            let filename = format!("book-{book_id}.{ext}");
            let dest = root.join(subdir).join(&filename);
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

/// Whether a format name denotes an audiobook.
fn is_audiobook_format(format_name: &str) -> bool {
    matches!(
        format_name,
        "mp3" | "m4b" | "flac" | "m4a" | "aac" | "ogg" | "opus" | "wma"
    )
}

/// Sanitize a name for use in a filesystem path.
fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Parse a release/file stem into a probable book title. Handles the common
/// `Author - Title` / `Title - Author` shapes and strips release tags.
fn parse_release_name(stem: &str) -> Option<String> {
    let cleaned = clean_release_text(stem);
    if cleaned.is_empty() {
        return None;
    }
    if let Some((left, right)) = cleaned.split_once(" - ") {
        let (l, r) = (left.trim(), right.trim());
        // The title is usually the side with more words.
        let pick = if word_count(r) >= word_count(l) { r } else { l };
        if !pick.is_empty() {
            return Some(pick.to_string());
        }
    }
    Some(cleaned)
}

/// Parse the author from a `Author - Title` / `Title - Author` stem.
fn parse_release_author(stem: &str) -> Option<String> {
    let cleaned = clean_release_text(stem);
    let (left, right) = cleaned.split_once(" - ")?;
    let (l, r) = (left.trim(), right.trim());
    let author = if word_count(r) > word_count(l) { l } else { r };
    if author.is_empty() {
        None
    } else {
        Some(author.to_string())
    }
}

/// Strip bracketed groups (quality, year, release group) and known format tags.
fn clean_release_text(s: &str) -> String {
    let mut out = String::new();
    let mut depth = 0u32;
    for c in s.chars() {
        match c {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth = depth.saturating_sub(1),
            _ if depth == 0 => out.push(if c == '_' || c == '.' { ' ' } else { c }),
            _ => {}
        }
    }
    const TAGS: &[&str] = &[
        "epub", "mobi", "azw3", "pdf", "mp3", "m4b", "m4a", "flac", "retail", "webrip",
        "unabridged", "audiobook", "proper", "repack",
    ];
    out.split_whitespace()
        .filter(|w| {
            let lw = w.to_lowercase();
            let lw = lw.trim_matches(|c: char| !c.is_alphanumeric());
            !TAGS.contains(&lw)
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn word_count(s: &str) -> usize {
    s.split_whitespace().filter(|w| w.chars().any(|c| c.is_alphanumeric())).count()
}

/// Normalize a title for fuzzy comparison: lowercase, alphanumeric words only.
fn normalize_title(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Find the tracked book whose title best matches a parsed title: exact first,
/// then a containment match where the shorter side is at least 60% of the longer.
fn best_book_match<'a>(parsed_title: &str, books: &'a [Book]) -> Option<&'a Book> {
    let p = normalize_title(parsed_title);
    if p.is_empty() {
        return None;
    }
    books
        .iter()
        .find(|b| normalize_title(&b.title) == p)
        .or_else(|| {
            books.iter().find(|b| {
                let bt = normalize_title(&b.title);
                let (short, long) = if bt.len() <= p.len() { (&bt, &p) } else { (&p, &bt) };
                short.len() >= 4 && long.contains(short.as_str()) && short.len() * 100 / long.len() >= 60
            })
        })
}

/// Parse a quality name back from its `Debug` form.
fn quality_from_str(s: &str) -> Option<Quality> {
    match s.to_lowercase().as_str() {
        "pdf" => Some(Quality::PDF),
        "mobi" => Some(Quality::MOBI),
        "epub" => Some(Quality::EPUB),
        "azw3" => Some(Quality::AZW3),
        "mp3" => Some(Quality::MP3),
        "m4b" => Some(Quality::M4B),
        "flac" => Some(Quality::FLAC),
        "unknown" => Some(Quality::Unknown),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_author_title_both_ways() {
        assert_eq!(
            parse_release_name("Isaac Asimov - The Caves of Steel"),
            Some("The Caves of Steel".into())
        );
        assert_eq!(
            parse_release_name("The Caves of Steel - Isaac Asimov"),
            Some("The Caves of Steel".into())
        );
    }

    #[test]
    fn strips_release_tags() {
        assert_eq!(
            parse_release_name("The Caves of Steel [epub]"),
            Some("The Caves of Steel".into())
        );
        assert_eq!(
            parse_release_name("Dune (1965)"),
            Some("Dune".into())
        );
    }

    #[test]
    fn detects_multi_book_packs() {
        let pack = vec![
            PathBuf::from("/x/Asimov - Book One.epub"),
            PathBuf::from("/x/Asimov - Book Two.epub"),
        ];
        assert!(ImportManager::looks_multi_book(&pack));

        let same_book = vec![
            PathBuf::from("/x/The Caves of Steel.epub"),
            PathBuf::from("/x/The Caves of Steel.mobi"),
        ];
        assert!(!ImportManager::looks_multi_book(&same_book));
    }

    #[test]
    fn audio_parts_are_not_a_pack() {
        let parts = vec![
            PathBuf::from("/x/01 - Chapter One.mp3"),
            PathBuf::from("/x/02 - Chapter Two.mp3"),
        ];
        assert!(!ImportManager::looks_multi_book(&parts));
    }
}
