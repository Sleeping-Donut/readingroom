use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::models::*;

// ---------------------------------------------------------------------------
// Metadata Source (book/author information)
// ---------------------------------------------------------------------------

#[async_trait]
pub trait MetadataSource: Send + Sync {
    fn name(&self) -> &'static str;

    async fn search_author(&self, query: &str) -> Result<Vec<Author>>;
    async fn get_author(&self, foreign_id: &str) -> Result<Author>;
    async fn get_author_books(&self, foreign_id: &str) -> Result<Vec<Book>>;

    async fn search_book(&self, query: &str) -> Result<Vec<Book>>;
    async fn get_book(&self, foreign_id: &str) -> Result<Book>;
    async fn get_book_editions(&self, foreign_id: &str) -> Result<Vec<Edition>>;
    async fn get_series(&self, foreign_id: &str) -> Result<Series>;
}

// ---------------------------------------------------------------------------
// Indexer (search for downloadable releases)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct SearchCriteria {
    pub query: Option<String>,
    pub author: Option<String>,
    pub title: Option<String>,
    pub isbn: Option<String>,
    pub limit: Option<usize>,
}

#[async_trait]
pub trait Indexer: Send + Sync {
    fn name(&self) -> &str;
    fn supports_rss(&self) -> bool;
    fn supports_search(&self) -> bool;

    async fn rss_sync(&self) -> Result<Vec<Release>>;
    async fn search(&self, criteria: &SearchCriteria) -> Result<Vec<Release>>;
}

// ---------------------------------------------------------------------------
// Download Client (remote torrent/usenet client)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Completed,
    Seeding,
    Failed(String),
    Removed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: DownloadId,
    pub name: String,
    pub status: DownloadStatus,
    pub size: i64,
    pub downloaded_bytes: i64,
    pub progress: f64,
    pub added_at: chrono::DateTime<chrono::Utc>,
    pub estimated_completion: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub version: Option<String>,
    pub default_save_path: Option<String>,
    pub free_space: Option<i64>,
}

#[async_trait]
pub trait DownloadClient: Send + Sync {
    fn name(&self) -> &str;
    fn protocol(&self) -> DownloadType;

    /// Send a release to the download client
    async fn add_release(&self, release: &Release) -> Result<DownloadId>;
    /// Remove a download (delete from client)
    async fn remove_download(&self, id: &DownloadId) -> Result<()>;
    /// Get current status of a download
    async fn get_status(&self, id: &DownloadId) -> Result<DownloadStatus>;
    /// List all active downloads
    async fn list_active(&self) -> Result<Vec<DownloadItem>>;
    /// Get client configuration/capabilities
    async fn get_config(&self) -> Result<ClientConfig>;

    /// Get the local directory path for a specific download
    async fn get_download_path(&self, id: &DownloadId) -> Result<String>;
}

// ---------------------------------------------------------------------------
// Notification Service
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub enum NotificationEvent {
    Grab { release: Release },
    Import { book: Book, file: BookFile },
    Upgrade { book: Book, old_file: BookFile, new_file: BookFile },
    HealthIssue { message: String, severity: String },
    Test,
}

#[async_trait]
pub trait NotificationService: Send + Sync {
    fn name(&self) -> &str;
    async fn send(&self, event: &NotificationEvent) -> Result<()>;
}
