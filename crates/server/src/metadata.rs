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
}

#[async_trait]
impl MetadataSource for MetadataDispatcher {
    fn name(&self) -> &'static str {
        "dispatcher"
    }

    // In offline mode the offline cache is the ONLY source — never fall back to
    // the online API (it defeats the point of offline mode and hangs for a
    // long timeout when the network is unreachable).
    async fn search_author(&self, query: &str) -> Result<Vec<Author>> {
        if self.offline_mode.load(Ordering::Relaxed) {
            self.offline.search_author(query).await
        } else {
            self.online.search_author(query).await
        }
    }

    async fn get_author(&self, foreign_id: &str) -> Result<Author> {
        if self.offline_mode.load(Ordering::Relaxed) {
            self.offline.get_author(foreign_id).await
        } else {
            self.online.get_author(foreign_id).await
        }
    }

    async fn get_author_books(&self, foreign_id: &str) -> Result<Vec<Book>> {
        if self.offline_mode.load(Ordering::Relaxed) {
            self.offline.get_author_books(foreign_id).await
        } else {
            self.online.get_author_books(foreign_id).await
        }
    }

    async fn search_book(&self, query: &str) -> Result<Vec<Book>> {
        if self.offline_mode.load(Ordering::Relaxed) {
            self.offline.search_book(query).await
        } else {
            self.online.search_book(query).await
        }
    }

    async fn get_book(&self, foreign_id: &str) -> Result<Book> {
        if self.offline_mode.load(Ordering::Relaxed) {
            self.offline.get_book(foreign_id).await
        } else {
            self.online.get_book(foreign_id).await
        }
    }

    async fn get_book_editions(&self, foreign_id: &str) -> Result<Vec<Edition>> {
        if self.offline_mode.load(Ordering::Relaxed) {
            self.offline.get_book_editions(foreign_id).await
        } else {
            self.online.get_book_editions(foreign_id).await
        }
    }

    async fn get_series(&self, foreign_id: &str) -> Result<Series> {
        if self.offline_mode.load(Ordering::Relaxed) {
            self.offline.get_series(foreign_id).await
        } else {
            self.online.get_series(foreign_id).await
        }
    }
}
