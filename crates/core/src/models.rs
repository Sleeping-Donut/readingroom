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
// Edition
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EditionFormat {
    EBook,
    AudioBook,
    Physical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DownloadType {
    NZB,
    Torrent,
    Magnet,
    Direct,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
