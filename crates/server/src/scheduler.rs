use std::sync::Arc;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};

use chrono::{DateTime, Utc};
use tokio_cron_scheduler::{Job, JobScheduler};

use readingroom_core::error::Result;
use readingroom_core::models::MonitoredBook;

use crate::db;
use crate::downloads::DownloadManager;
use crate::import_list::ImportListManager;
use crate::search::SearchEngine;

// ---------------------------------------------------------------------------
// Job state types — illegal states are unrepresentable at compile time
// ---------------------------------------------------------------------------

pub struct Idle;
pub struct Running;
pub struct Completed;
pub struct Failed(String);

/// Shared mutable state for a typed job, behind an Arc so it can be shared
/// between the Scheduler and the cron job closures.
struct JobSharedState {
    running: AtomicBool,
    last_run: std::sync::Mutex<Option<DateTime<Utc>>>,
    last_error: std::sync::Mutex<Option<String>>,
}

/// A scheduler job with compile-time state tracking.
/// Transitions: Idle → Running → Completed | Failed → Idle
pub struct TypedJob<S> {
    pub name: &'static str,
    pub interval: &'static str,
    shared: Arc<JobSharedState>,
    _state: std::marker::PhantomData<S>,
}

impl TypedJob<Idle> {
    pub fn new(name: &'static str, interval: &'static str) -> Self {
        Self {
            name,
            interval,
            shared: Arc::new(JobSharedState {
                running: AtomicBool::new(false),
                last_run: std::sync::Mutex::new(None),
                last_error: std::sync::Mutex::new(None),
            }),
            _state: std::marker::PhantomData,
        }
    }

    /// Try to start the job. Returns None if already running.
    pub fn try_start(self) -> Option<TypedJob<Running>> {
        if self.shared.running.swap(true, Ordering::SeqCst) {
            tracing::warn!(name = %self.name, "Job is already running, skipping");
            return None;
        }
        Some(TypedJob {
            name: self.name,
            interval: self.interval,
            shared: self.shared,
            _state: std::marker::PhantomData,
        })
    }

    /// Create a Running-typed job sharing the same state (for use inside closures).
    pub fn shared(&self) -> TypedJob<Idle> {
        TypedJob {
            name: self.name,
            interval: self.interval,
            shared: Arc::clone(&self.shared),
            _state: std::marker::PhantomData,
        }
    }
}

impl TypedJob<Running> {
    pub fn complete(self) -> TypedJob<Idle> {
        self.shared.running.store(false, Ordering::SeqCst);
        if let Ok(mut last_run) = self.shared.last_run.lock() {
            *last_run = Some(Utc::now());
        }
        if let Ok(mut last_error) = self.shared.last_error.lock() {
            *last_error = None;
        }
        TypedJob {
            name: self.name,
            interval: self.interval,
            shared: self.shared,
            _state: std::marker::PhantomData,
        }
    }

    pub fn fail(self, error: String) -> TypedJob<Idle> {
        self.shared.running.store(false, Ordering::SeqCst);
        if let Ok(mut last_run) = self.shared.last_run.lock() {
            *last_run = Some(Utc::now());
        }
        if let Ok(mut last_error) = self.shared.last_error.lock() {
            *last_error = Some(error);
        }
        TypedJob {
            name: self.name,
            interval: self.interval,
            shared: self.shared,
            _state: std::marker::PhantomData,
        }
    }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

pub struct Scheduler {
    db: sqlx::SqlitePool,
    download_manager: Arc<DownloadManager>,
    search_engine: Arc<SearchEngine>,
    import_list_manager: Arc<ImportListManager>,
    poll_job: TypedJob<Idle>,
    search_missing_job: TypedJob<Idle>,
    import_list_job: TypedJob<Idle>,
}

impl Scheduler {
    pub fn new(
        db: sqlx::SqlitePool,
        download_manager: Arc<DownloadManager>,
        search_engine: Arc<SearchEngine>,
        import_list_manager: Arc<ImportListManager>,
    ) -> Self {
        Self {
            poll_job: TypedJob::new("poll_downloads", "1/30 * * * * *"),
            search_missing_job: TypedJob::new("search_missing", "0 0 * * * *"),
            import_list_job: TypedJob::new("import_list_sync", "0 0 * * * *"),
            db,
            download_manager,
            search_engine,
            import_list_manager,
        }
    }

    pub async fn start(&self) -> Result<()> {
        let sched = JobScheduler::new().await.map_err(|e| {
            readingroom_core::error::AppError::Other(format!("Failed to create scheduler: {e}"))
        })?;

        // Poll downloads every 30 seconds
        let poll_idle = self.poll_job.shared();
        let dm = self.download_manager.clone();
        let poll_cron = Job::new_async("1/30 * * * * *", move |_uuid, _lock| {
            let poll_idle = poll_idle.shared();
            let dm = dm.clone();
            Box::pin(async move {
                let Some(running) = poll_idle.try_start() else { return };
                if let Err(e) = dm.poll_active().await {
                    tracing::error!(error = %e, "Scheduled poll_downloads failed");
                    let _ = running.fail(e.to_string());
                } else {
                    let _ = running.complete();
                }
            })
        })
        .map_err(|e| {
            readingroom_core::error::AppError::Other(format!("Failed to create poll job: {e}"))
        })?;
        sched.add(poll_cron).await.map_err(|e| {
            readingroom_core::error::AppError::Other(format!("Failed to add poll job: {e}"))
        })?;

        // Search missing books every hour
        let search_idle = self.search_missing_job.shared();
        let dm2 = self.download_manager.clone();
        let se2 = self.search_engine.clone();
        let db2 = self.db.clone();
        let search_cron = Job::new_async("0 0 * * * *", move |_uuid, _lock| {
            let search_idle = search_idle.shared();
            let dm = dm2.clone();
            let se = se2.clone();
            let db = db2.clone();
            Box::pin(async move {
                let Some(running) = search_idle.try_start() else { return };
                if let Err(e) = search_missing_books(&db, &se, &dm).await {
                    tracing::error!(error = %e, "Scheduled search_missing failed");
                    let _ = running.fail(e.to_string());
                } else {
                    let _ = running.complete();
                }
            })
        })
        .map_err(|e| {
            readingroom_core::error::AppError::Other(format!(
                "Failed to create search_missing job: {e}"
            ))
        })?;
        sched.add(search_cron).await.map_err(|e| {
            readingroom_core::error::AppError::Other(format!(
                "Failed to add search missing job: {e}"
            ))
        })?;

        // Sync import lists every hour
        let import_idle = self.import_list_job.shared();
        let ilm = self.import_list_manager.clone();
        let import_cron = Job::new_async("0 0 * * * *", move |_uuid, _lock| {
            let import_idle = import_idle.shared();
            let ilm = ilm.clone();
            Box::pin(async move {
                let Some(running) = import_idle.try_start() else { return };
                if let Err(e) = ilm.sync_all().await {
                    tracing::error!(error = %e, "Scheduled import_list_sync failed");
                    let _ = running.fail(e.to_string());
                } else {
                    let _ = running.complete();
                }
            })
        })
        .map_err(|e| {
            readingroom_core::error::AppError::Other(format!(
                "Failed to create import_list_sync job: {e}"
            ))
        })?;
        sched.add(import_cron).await.map_err(|e| {
            readingroom_core::error::AppError::Other(format!(
                "Failed to add import_list_sync job: {e}"
            ))
        })?;

        sched.start().await.map_err(|e| {
            readingroom_core::error::AppError::Other(format!("Failed to start scheduler: {e}"))
        })?;
        tracing::info!("Background scheduler started");

        Ok(())
    }
}

/// Search for all monitored books that have no book_files, and download the best match.
pub(crate) async fn search_missing_books(
    db: &sqlx::SqlitePool,
    search_engine: &SearchEngine,
    download_manager: &DownloadManager,
) -> Result<()> {
    let books = db::list_books(db).await?;
    let monitored: Vec<MonitoredBook> = books.into_iter().filter_map(|b| b.into_monitored()).collect();

    tracing::info!(
        total = %monitored.len(),
        "Searching for missing books"
    );

    // Batch query: get all book_ids that already have files
    let have_files: HashSet<i64> = sqlx::query_scalar::<_, i64>(
        "SELECT DISTINCT e.book_id FROM book_files bf
         JOIN editions e ON bf.edition_id = e.id
         WHERE e.book_id IN (SELECT id FROM books WHERE monitored = 1)",
    )
    .fetch_all(db)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    // Batch query: get all book_ids that are already in queue (active)
    let in_queue: HashSet<i64> = sqlx::query_scalar::<_, i64>(
        "SELECT DISTINCT book_id FROM queue
         WHERE book_id IN (SELECT id FROM books WHERE monitored = 1)
         AND status NOT IN ('completed', 'failed', 'removed')",
    )
    .fetch_all(db)
    .await
    .unwrap_or_default()
    .into_iter()
    .collect();

    for book in &monitored {
        if have_files.contains(&book.id) {
            continue;
        }

        if in_queue.contains(&book.id) {
            continue;
        }

        tracing::debug!(book = %book.title, "Searching for missing book");

        // Search indexers
        let results = match search_engine.search_book(book).await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(
                    book = %book.title,
                    error = %e,
                    "Search failed for missing book"
                );
                continue;
            }
        };

        // Pick best release (score > 50 threshold)
        if let Some(best) = results.into_iter().find(|r| r.score > 50.0) {
            tracing::info!(
                book = %book.title,
                release = %best.release.title,
                score = %best.score,
                "Found release for missing book, downloading"
            );

            if let Err(e) = download_manager
                .download_release(&best.release, book.id)
                .await
            {
                tracing::error!(
                    book = %book.title,
                    error = %e,
                    "Failed to download release for missing book"
                );
            }
        }
    }

    Ok(())
}
