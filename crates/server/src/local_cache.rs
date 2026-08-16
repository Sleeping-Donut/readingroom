use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use readingroom_core::error::Result;
use readingroom_metadata::ol_dump::{
    ImportCounts, ImportHandle, ImportProgress, OlCacheSource, download_and_import, DEFAULT_DUMP_URL,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

pub const CONFIG_KEY: &str = "metadata";

/// User-facing metadata source settings, persisted in the DB config table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataSettings {
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default = "default_true")]
    pub auto_update: bool,
    #[serde(default = "default_dump_url")]
    pub dump_url: String,
}

fn default_mode() -> String {
    "online".into()
}
fn default_true() -> bool {
    true
}
fn default_dump_url() -> String {
    DEFAULT_DUMP_URL.to_string()
}

impl Default for MetadataSettings {
    fn default() -> Self {
        Self {
            mode: default_mode(),
            auto_update: default_true(),
            dump_url: default_dump_url(),
        }
    }
}

pub async fn load_settings(db: &SqlitePool) -> MetadataSettings {
    match crate::db::get_config_value(db, CONFIG_KEY).await {
        Ok(Some(json)) => serde_json::from_str::<MetadataSettings>(&json).unwrap_or_default(),
        _ => MetadataSettings::default(),
    }
}

pub async fn save_settings(db: &SqlitePool, settings: &MetadataSettings) -> Result<()> {
    let value = serde_json::to_string(settings).unwrap_or_default();
    crate::db::set_config_value(db, CONFIG_KEY, &value).await
}

/// Result of a periodic/newer-dump check.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheck {
    pub newer: bool,
    pub last_modified: Option<String>,
    pub started: bool,
}

/// Owns the offline OpenLibrary dump cache: the SQLite source, live import
/// progress, and the long-running download/import task. The settings API and
/// the scheduler both drive this.
pub struct LocalCacheManager {
    db: SqlitePool,
    db_path: PathBuf,
    source: Arc<OlCacheSource>,
    handle: ImportHandle,
    http: reqwest::Client,
    running: Arc<AtomicBool>,
}

impl LocalCacheManager {
    pub async fn new(db: SqlitePool, data_dir: &std::path::Path) -> Result<Arc<Self>> {
        let db_path = data_dir.join("ol_dump.sqlite");
        let source = Arc::new(OlCacheSource::open(&db_path).await?);
        Ok(Arc::new(Self {
            db,
            db_path,
            source,
            handle: ImportHandle::new(),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()?,
            running: Arc::new(AtomicBool::new(false)),
        }))
    }

    pub fn source(&self) -> OlCacheSource {
        self.source.as_ref().clone()
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.db
    }

    pub fn handle(&self) -> &ImportHandle {
        &self.handle
    }

    pub fn progress(&self) -> ImportProgress {
        self.handle.snapshot()
    }

    pub async fn stats(&self) -> Result<(ImportCounts, Option<String>)> {
        self.source.stats().await
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    /// If offline mode is enabled and the cache is empty, start a background
    /// download+import. Called at startup and when the mode is switched on.
    pub async fn ensure_downloaded(&self) {
        let empty = match self.source.stats().await {
            Ok((c, _)) => c.works == 0 && c.editions == 0 && c.authors == 0 && c.redirects == 0,
            Err(_) => true,
        };
        if empty {
            let settings = load_settings(&self.db).await;
            let _ = self.request_download(settings.dump_url.clone());
        }
    }

    /// Kick off a background download+import. Returns true if a task started,
    /// false if one is already running.
    pub fn request_download(&self, url: String) -> bool {
        if self.running.swap(true, Ordering::SeqCst) {
            return false;
        }
        let pool = self.source.pool().clone();
        let handle = self.handle.clone();
        let running = self.running.clone();
        tokio::spawn(async move {
            match download_and_import(&pool, &url, &handle).await {
                Ok(counts) => tracing::info!(
                    works = counts.works,
                    editions = counts.editions,
                    authors = counts.authors,
                    redirects = counts.redirects,
                    "OpenLibrary dump import complete"
                ),
                Err(e) => tracing::error!(error = %e, "OpenLibrary dump import failed"),
            }
            running.store(false, Ordering::SeqCst);
        });
        true
    }

    /// HEAD the dump URL and, when the remote dump is newer than the last
    /// import, trigger a re-import. Used by the periodic scheduler job.
    pub async fn check_for_updates(&self) -> Result<UpdateCheck> {
        let settings = load_settings(&self.db).await;
        let resp = self.http.head(&settings.dump_url).send().await?;
        let last_modified = resp
            .headers()
            .get(reqwest::header::LAST_MODIFIED)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let remote = last_modified
            .as_deref()
            .and_then(parse_http_date)
            .or_else(|| resp.headers().get(reqwest::header::DATE).and_then(|v| v.to_str().ok()).and_then(parse_http_date));
        let local = self
            .stats()
            .await
            .ok()
            .and_then(|(_, ts)| ts)
            .and_then(|ts| DateTime::parse_from_rfc3339(&ts).ok().map(|d| d.with_timezone(&Utc)));

        let newer = match (remote, local) {
            (Some(r), Some(l)) => r > l,
            (Some(_), None) => true,
            _ => false,
        };
        let started = if newer { self.request_download(settings.dump_url.clone()) } else { false };
        Ok(UpdateCheck {
            newer,
            last_modified,
            started,
        })
    }

    /// The cache DB path, for status reporting.
    pub fn db_path(&self) -> &PathBuf {
        &self.db_path
    }
}

/// Parse an HTTP-date (RFC 2822/7231), e.g. "Wed, 09 Aug 2026 12:00:00 GMT".
fn parse_http_date(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc2822(s)
        .map(|d| d.with_timezone(&Utc))
        .ok()
}
