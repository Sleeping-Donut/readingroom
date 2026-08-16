use std::sync::atomic::{AtomicBool, Ordering};

use async_trait::async_trait;
use readingroom_core::{
    error::Result,
    models::*,
    traits::MetadataSource,
};

use crate::cache::CachedMetadataSource;

/// Routes metadata lookups between the online OpenLibrary API and the local
/// dump cache. The active mode is a plain atomic so the settings API can flip
/// it at runtime without a restart. Each backing source keeps its own cache so
/// switching modes never serves stale results from the other source.
pub struct MetadataDispatcher {
    online: CachedMetadataSource,
    offline: CachedMetadataSource,
    offline_mode: AtomicBool,
}

impl MetadataDispatcher {
    pub fn new(online: CachedMetadataSource, offline: CachedMetadataSource) -> Self {
        Self {
            online,
            offline,
            offline_mode: AtomicBool::new(false),
        }
    }

    pub fn set_offline_mode(&self, enabled: bool) {
        self.offline_mode.store(enabled, Ordering::Relaxed);
    }

    pub fn offline_mode(&self) -> bool {
        self.offline_mode.load(Ordering::Relaxed)
    }

    /// Prefer the offline source when enabled, falling back to online on any
    /// lookup error (records newer than the dump, or a still-importing cache).
    async fn detail<T>(&self, offline: impl std::future::Future<Output = Result<T>>, online: impl std::future::Future<Output = Result<T>>) -> Result<T> {
        if self.offline_mode.load(Ordering::Relaxed) {
            match offline.await {
                Ok(v) => return Ok(v),
                Err(_) => {}
            }
        }
        online.await
    }
}

#[async_trait]
impl MetadataSource for MetadataDispatcher {
    fn name(&self) -> &'static str {
        "dispatcher"
    }

    async fn search_author(&self, query: &str) -> Result<Vec<Author>> {
        if self.offline_mode.load(Ordering::Relaxed) {
            match self.offline.search_author(query).await {
                Ok(authors) if !authors.is_empty() => return Ok(authors),
                Ok(_) => {}
                Err(_) => {}
            }
        }
        self.online.search_author(query).await
    }

    async fn get_author(&self, foreign_id: &str) -> Result<Author> {
        self.detail(self.offline.get_author(foreign_id), self.online.get_author(foreign_id))
            .await
    }

    async fn get_author_books(&self, foreign_id: &str) -> Result<Vec<Book>> {
        self.detail(self.offline.get_author_books(foreign_id), self.online.get_author_books(foreign_id))
            .await
    }

    async fn search_book(&self, query: &str) -> Result<Vec<Book>> {
        if self.offline_mode.load(Ordering::Relaxed) {
            match self.offline.search_book(query).await {
                Ok(books) if !books.is_empty() => return Ok(books),
                Ok(_) => {}
                Err(_) => {}
            }
        }
        self.online.search_book(query).await
    }

    async fn get_book(&self, foreign_id: &str) -> Result<Book> {
        self.detail(self.offline.get_book(foreign_id), self.online.get_book(foreign_id))
            .await
    }

    async fn get_book_editions(&self, foreign_id: &str) -> Result<Vec<Edition>> {
        self.detail(self.offline.get_book_editions(foreign_id), self.online.get_book_editions(foreign_id))
            .await
    }

    async fn get_series(&self, foreign_id: &str) -> Result<Series> {
        self.online.get_series(foreign_id).await
    }
}
