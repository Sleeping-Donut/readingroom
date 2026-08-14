use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Author
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Author {
    pub id: i64,
    pub foreign_id: String,
    pub name: String,
    pub sort_name: Option<String>,
    pub biography: Option<String>,
    pub image_url: Option<String>,
    pub birth_date: Option<NaiveDate>,
    pub death_date: Option<NaiveDate>,
    pub genres: Vec<String>,
    pub aliases: Vec<String>,
    pub links: Vec<Link>,
    pub monitored: bool,
    pub added_at: DateTime<Utc>,
    pub tags: Vec<i64>,
}

// ---------------------------------------------------------------------------
// Book
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: i64,
    pub foreign_id: String,
    pub author_id: i64,
    pub title: String,
    pub clean_title: String,
    pub description: Option<String>,
    pub isbn: Option<String>,
    pub isbn13: Option<String>,
    pub asin: Option<String>,
    pub pages: Option<i32>,
    pub publisher: Option<String>,
    pub publish_date: Option<NaiveDate>,
    pub image_url: Option<String>,
    pub genres: Vec<String>,
    pub ratings: Option<f64>,
    pub language: String,
    pub monitored: bool,
    pub added_at: DateTime<Utc>,
    pub last_search_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Typestate wrappers — compile-time safety for monitored vs. unmonitored
// ---------------------------------------------------------------------------

/// A book that is actively monitored. Created via `Book::into_monitored()`.
/// Only `MonitoredBook` can be searched/downloaded.
#[derive(Debug, Clone)]
pub struct MonitoredBook {
    pub inner: Book,
}

/// A book that is not monitored. Created via `Book::into_unmonitored()`.
#[derive(Debug, Clone)]
pub struct UnmonitoredBook {
    pub inner: Book,
}

impl Book {
    pub fn into_monitored(self) -> Option<MonitoredBook> {
        if self.monitored {
            Some(MonitoredBook { inner: self })
        } else {
            None
        }
    }

    pub fn into_unmonitored(self) -> UnmonitoredBook {
        UnmonitoredBook { inner: self }
    }
}

impl std::ops::Deref for MonitoredBook {
    type Target = Book;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl std::ops::Deref for UnmonitoredBook {
    type Target = Book;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

/// An author that is actively monitored. Created via `Author::into_monitored()`.
#[derive(Debug, Clone)]
pub struct MonitoredAuthor {
    pub inner: Author,
}

/// An author that is not monitored. Created via `Author::into_unmonitored()`.
#[derive(Debug, Clone)]
pub struct UnmonitoredAuthor {
    pub inner: Author,
}

impl Author {
    pub fn into_monitored(self) -> Option<MonitoredAuthor> {
        if self.monitored {
            Some(MonitoredAuthor { inner: self })
        } else {
            None
        }
    }

    pub fn into_unmonitored(self) -> UnmonitoredAuthor {
        UnmonitoredAuthor { inner: self }
    }
}

impl std::ops::Deref for MonitoredAuthor {
    type Target = Author;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl std::ops::Deref for UnmonitoredAuthor {
    type Target = Author;
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

// ---------------------------------------------------------------------------
// Edition
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub enum EditionFormat {
    EBook,
    AudioBook,
    Physical,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[non_exhaustive]
pub enum Quality {
    PDF,
    MOBI,
    EPUB,
    AZW3,
    MP3,
    M4B,
    FLAC,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edition {
    pub id: i64,
    pub book_id: i64,
    pub foreign_edition_id: String,
    pub isbn13: Option<String>,
    pub asin: Option<String>,
    pub title: String,
    pub language: String,
    pub format: EditionFormat,
    pub quality: Option<Quality>,
    pub publisher: Option<String>,
    pub pages: Option<i32>,
    pub release_date: Option<NaiveDate>,
    pub image_url: Option<String>,
    pub monitored: bool,
}

// ---------------------------------------------------------------------------
// BookFile
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub codec: Option<String>,
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub channels: Option<i32>,
    pub duration_secs: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookFile {
    pub id: i64,
    pub edition_id: i64,
    pub path: String,
    pub size: i64,
    pub quality: Quality,
    pub format: String,
    pub media_info: Option<MediaInfo>,
    pub date_added: DateTime<Utc>,
    pub calibre_id: Option<i64>,
    pub part: Option<i32>,
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Series {
    pub id: i64,
    pub foreign_series_id: String,
    pub title: String,
    pub description: Option<String>,
    pub numbered: bool,
    pub work_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesBookLink {
    pub series_id: i64,
    pub book_id: i64,
    pub position: f64,
    pub is_primary: bool,
    pub sort: Option<String>,
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    pub url: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Release {
    pub title: String,
    pub info_url: String,
    pub download_url: String,
    pub size: i64,
    pub pub_date: DateTime<Utc>,
    pub indexer: String,
    pub download_type: DownloadType,
    pub seeders: Option<i32>,
    pub peers: Option<i32>,
    pub grabs: Option<i32>,
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[non_exhaustive]
pub enum DownloadType {
    NZB,
    Torrent,
    Magnet,
    Direct,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub enum BookStatus {
    Wanted,
    Have,
    Missing,
    Snatched,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub query: String,
    pub author: Option<String>,
    pub book: Option<String>,
    pub isbn: Option<String>,
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

// ---------------------------------------------------------------------------
// Queue Status — typestate for the download pipeline
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[non_exhaustive]
pub enum QueueStatus {
    Queued,
    Downloading,
    Completed,
    Importing,
    Imported,
    Failed,
    Removed,
}

impl QueueStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            QueueStatus::Queued => "queued",
            QueueStatus::Downloading => "downloading",
            QueueStatus::Completed => "completed",
            QueueStatus::Importing => "importing",
            QueueStatus::Imported => "imported",
            QueueStatus::Failed => "failed",
            QueueStatus::Removed => "removed",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "queued" => QueueStatus::Queued,
            "downloading" => QueueStatus::Downloading,
            "completed" => QueueStatus::Completed,
            "importing" => QueueStatus::Importing,
            "imported" => QueueStatus::Imported,
            "failed" => QueueStatus::Failed,
            "removed" => QueueStatus::Removed,
            _ => QueueStatus::Queued,
        }
    }
}

// ---------------------------------------------------------------------------
// Typed queue entry wrappers for compile-time pipeline safety
// ---------------------------------------------------------------------------

/// A download that is being sent to the client (initial state).
pub struct QueuedDownload {
    pub book_id: i64,
    pub download_id: String,
    pub client_name: String,
    pub title: String,
    pub size: i64,
    pub queue_id: i64,
}

impl QueuedDownload {
    pub fn start_downloading(self) -> ActiveDownload {
        ActiveDownload {
            id: self.queue_id,
            book_id: self.book_id,
            download_id: self.download_id,
            download_client: self.client_name,
            title: self.title,
            size: self.size,
            progress: 0.0,
        }
    }
}

/// A download actively being tracked by the poller.
pub struct ActiveDownload {
    pub id: i64,
    pub book_id: i64,
    pub download_id: String,
    pub download_client: String,
    pub title: String,
    pub size: i64,
    pub progress: f64,
}

impl ActiveDownload {
    pub fn complete(self) -> CompletedDownload {
        CompletedDownload {
            id: self.id,
            book_id: self.book_id,
            download_id: self.download_id,
            download_client: self.download_client,
            title: self.title,
        }
    }

    pub fn fail(self) -> FailedDownload {
        FailedDownload {
            id: self.id,
            book_id: self.book_id,
            title: self.title,
        }
    }
}

/// A completed download ready for import.
pub struct CompletedDownload {
    pub id: i64,
    pub book_id: i64,
    pub download_id: String,
    pub download_client: String,
    pub title: String,
}

impl CompletedDownload {
    pub fn start_import(self) -> ImportingDownload {
        ImportingDownload {
            id: self.id,
            book_id: self.book_id,
            download_id: self.download_id,
            download_client: self.download_client,
            title: self.title,
        }
    }
}

pub struct ImportingDownload {
    pub id: i64,
    pub book_id: i64,
    pub download_id: String,
    pub download_client: String,
    pub title: String,
}

impl ImportingDownload {
    pub fn finish_import(self) -> ImportedDownload {
        ImportedDownload {
            id: self.id,
            book_id: self.book_id,
            title: self.title,
        }
    }

    pub fn fail_import(self) -> FailedDownload {
        FailedDownload {
            id: self.id,
            book_id: self.book_id,
            title: self.title,
        }
    }
}

pub struct ImportedDownload {
    pub id: i64,
    pub book_id: i64,
    pub title: String,
}

pub struct FailedDownload {
    pub id: i64,
    pub book_id: i64,
    pub title: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_author_serialization() {
        let author = Author {
            id: 1,
            foreign_id: "OL123".into(),
            name: "Test Author".into(),
            sort_name: Some("Author, Test".into()),
            biography: Some("A test author".into()),
            image_url: Some("https://example.com/img.jpg".into()),
            birth_date: Some(NaiveDate::from_ymd_opt(1900, 1, 1).unwrap()),
            death_date: None,
            genres: vec!["fiction".into()],
            aliases: vec![],
            links: vec![Link { url: "https://example.com".into(), label: Some("Website".into()) }],
            monitored: true,
            added_at: Utc::now(),
            tags: vec![],
        };

        let json = serde_json::to_string(&author).unwrap();
        let deserialized: Author = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, 1);
        assert_eq!(deserialized.name, "Test Author");
        assert_eq!(deserialized.genres, vec!["fiction"]);
    }

    #[test]
    fn test_book_serialization() {
        let book = Book {
            id: 1,
            foreign_id: "OL456".into(),
            author_id: 1,
            title: "Test Book".into(),
            clean_title: "test book".into(),
            description: Some("A great book".into()),
            isbn: Some("1234567890".into()),
            isbn13: Some("9781234567890".into()),
            asin: None,
            pages: Some(300),
            publisher: Some("Test Press".into()),
            publish_date: Some(NaiveDate::from_ymd_opt(2020, 6, 15).unwrap()),
            image_url: Some("https://example.com/book.jpg".into()),
            genres: vec!["sci-fi".into()],
            ratings: Some(4.5),
            language: "en".into(),
            monitored: true,
            added_at: Utc::now(),
            last_search_at: None,
        };

        let json = serde_json::to_string_pretty(&book).unwrap();
        let deserialized: Book = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.title, "Test Book");
        assert_eq!(deserialized.pages, Some(300));
        assert_eq!(deserialized.ratings, Some(4.5));
    }

    #[test]
    fn test_quality_deserialization() {
        let json = "\"EPUB\"";
        let q: Quality = serde_json::from_str(json).unwrap();
        assert_eq!(q, Quality::EPUB);

        let json = "\"MOBI\"";
        let q: Quality = serde_json::from_str(json).unwrap();
        assert_eq!(q, Quality::MOBI);
    }

    #[test]
    fn test_release_serialization() {
        let release = Release {
            title: "Test Release".into(),
            info_url: "https://example.com/info".into(),
            download_url: "https://example.com/download.torrent".into(),
            size: 5_000_000,
            pub_date: Utc::now(),
            indexer: "TestIndexer".into(),
            download_type: DownloadType::Torrent,
            seeders: Some(100),
            peers: Some(50),
            grabs: Some(200),
            categories: vec!["Books".into(), "Ebook".into()],
        };

        let json = serde_json::to_string(&release).unwrap();
        let deserialized: Release = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.title, "Test Release");
        assert_eq!(deserialized.seeders, Some(100));
        assert_eq!(deserialized.download_type, DownloadType::Torrent);
    }

    #[test]
    fn test_quality_default() {
        // Unknown should be lowest
        assert!(Quality::Unknown as i32 > Quality::EPUB as i32);
    }
}
