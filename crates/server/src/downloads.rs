use std::sync::Arc;

use readingroom_core::{
    error::{AppError, Result},
    models::{ActiveDownload, CompletedDownload, DownloadType, FailedDownload, ImportedDownload, ImportingDownload, QueuedDownload, QueueStatus, Release},
    traits::{DownloadClient, DownloadId, DownloadStatus, NotificationEvent},
};
use tokio::sync::Mutex;

use crate::db;
use crate::import::ImportManager;
use crate::notifications::NotificationManager;
use crate::ws::{self, WsBroadcaster};

/// Manages downloads: sending releases to clients, tracking queue, importing.
pub struct DownloadManager {
    clients: Vec<Box<dyn DownloadClient>>,
    db: sqlx::SqlitePool,
    import_manager: Option<Arc<ImportManager>>,
    broadcaster: Mutex<Option<WsBroadcaster>>,
    notification_manager: Arc<tokio::sync::Mutex<NotificationManager>>,
}

/// Acquires both locks in the correct order: broadcaster FIRST, THEN notification_manager.
/// This ordering must always be followed to prevent deadlocks.
/// Drop order (reverse of acquire) is guaranteed by Rust.
pub struct LockOrderGuard<'a> {
    pub broadcaster: tokio::sync::MutexGuard<'a, Option<WsBroadcaster>>,
    pub notification: tokio::sync::MutexGuard<'a, NotificationManager>,
}

impl DownloadManager {
    pub fn new(
        clients: Vec<Box<dyn DownloadClient>>,
        db: sqlx::SqlitePool,
        import_manager: Option<Arc<ImportManager>>,
        notification_manager: Arc<tokio::sync::Mutex<NotificationManager>>,
    ) -> Self {
        Self {
            clients,
            db,
            import_manager,
            broadcaster: Mutex::new(None),
            notification_manager,
        }
    }

    pub async fn set_broadcaster(&self, broadcaster: Option<WsBroadcaster>) {
        *self.broadcaster.lock().await = broadcaster;
    }

    /// Acquire both locks in the correct order (broadcaster → notification).
    /// This is the ONLY way the notification manager lock should be acquired
    /// when the broadcaster is also needed, enforcing compile-time ordering.
    pub async fn lock_both(&self) -> LockOrderGuard<'_> {
        let bc = self.broadcaster.lock().await;
        let nm = self.notification_manager.lock().await;
        LockOrderGuard {
            broadcaster: bc,
            notification: nm,
        }
    }

    /// Send a release to the highest-priority compatible client.
    pub async fn download_release(&self, release: &Release, book_id: i64) -> Result<i64> {
        let client = self
            .clients
            .first()
            .ok_or_else(|| AppError::Config("No download clients configured".into()))?;

        let protocol = client.protocol();
        if release.download_type != protocol && release.download_type != DownloadType::Magnet {
            return Err(AppError::Config(format!(
                "Client {} does not support {:?} downloads",
                client.name(),
                release.download_type
            )));
        }

        let download_id = client.add_release(release).await?;

        let queue_id = db::insert_queue_entry(
            &self.db,
            book_id,
            None,
            &download_id.0,
            client.name(),
            &release.title,
            release.size,
        )
        .await?;

        let queued = QueuedDownload {
            book_id,
            download_id: download_id.0,
            client_name: client.name().to_string(),
            title: release.title.clone(),
            size: release.size,
            queue_id,
        };
        let _active = queued.start_downloading();

        tracing::info!(
            queue_id = %queue_id,
            download_id = %_active.download_id,
            title = %release.title,
            client = %client.name(),
            "Release sent to download client"
        );

        let guards = self.lock_both().await;
        if let Some(ref bc) = *guards.broadcaster {
            ws::emit(
                bc,
                "queue_added",
                serde_json::json!({
                    "queue_id": queue_id,
                    "title": release.title,
                    "download_client": client.name(),
                }),
            );
        }
        guards.notification.send_to_all(&NotificationEvent::Grab { release: release.clone() }).await;

        Ok(queue_id)
    }

    /// Poll all active downloads and update their status in the DB.
    pub async fn poll_active(&self) -> Result<()> {
        let active_entries = db::list_active_queue(&self.db).await?;

        for entry in active_entries {
            let active = match entry.into_active() {
                Some(a) => a,
                None => continue,
            };

            let download_id = DownloadId(active.download_id.clone());

            let active_id = active.id;
            let client = self.clients.iter().find(|c| c.name() == active.download_client);

            match client {
                Some(client) => {
                    match client.get_status(&download_id).await {
                        Ok(status) => {
                            match self.handle_status(client.as_ref(), active, status).await {
                                Ok(()) => {}
                                Err(e) => {
                                    tracing::error!(queue_id = %active_id, error = %e, "Failed to handle download status");
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!(
                                queue_id = %active_id,
                                client = %client.name(),
                                error = %e,
                                "Failed to poll download status"
                            );
                        }
                    }
                }
                None => {
                    tracing::warn!(
                        queue_id = %active_id,
                        client_name = %active.download_client,
                        "No client found for download, marking as failed"
                    );
                    db::update_queue_status_to(&self.db, active_id, QueueStatus::Failed).await?;
                }
            }
        }

        Ok(())
    }

    async fn handle_status(
        &self,
        client: &dyn DownloadClient,
        active: ActiveDownload,
        status: DownloadStatus,
    ) -> Result<()> {
        match status {
            DownloadStatus::Queued => {
                db::update_queue_status_typed(&self.db, active.id, QueueStatus::Queued, 0.0).await?;
            }
            DownloadStatus::Downloading => {
                db::update_queue_status_typed(&self.db, active.id, QueueStatus::Downloading, 0.0).await?;
            }
            DownloadStatus::Completed => {
                db::update_queue_status_to(&self.db, active.id, QueueStatus::Completed).await?;

                {
                    let bc_lock = self.broadcaster.lock().await;
                    if let Some(ref bc) = *bc_lock {
                        ws::emit(
                            bc,
                            "download_completed",
                            serde_json::json!({
                                "queue_id": active.id,
                                "title": active.title,
                            }),
                        );
                    }
                }

                let completed: CompletedDownload = active.complete();
                self.import_completed(client, completed).await?;
            }
            DownloadStatus::Seeding => {
                db::update_queue_status_typed(&self.db, active.id, QueueStatus::Queued, 1.0).await?;
            }
            DownloadStatus::Failed(_msg) => {
                let failed: FailedDownload = active.fail();
                db::update_queue_status_to(&self.db, failed.id, QueueStatus::Failed).await?;
            }
            DownloadStatus::Removed => {
                db::update_queue_status_to(&self.db, active.id, QueueStatus::Removed).await?;
            }
            _ => {}
        }

        Ok(())
    }

    async fn import_completed(
        &self,
        client: &dyn DownloadClient,
        completed: CompletedDownload,
    ) -> Result<()> {
        if let Some(ref importer) = self.import_manager {
            let queue_id = completed.id;
            let title = completed.title.clone();
            match importer.import_completed(client, &completed).await {
                Ok(_) => {
                    db::update_queue_status_to(&self.db, queue_id, QueueStatus::Imported).await?;

                    let guards = self.lock_both().await;
                    if let Some(ref bc) = *guards.broadcaster {
                        ws::emit(
                            bc,
                            "import_completed",
                            serde_json::json!({
                                "queue_id": queue_id,
                                "title": title,
                            }),
                        );
                    }
                    if let Ok(Some(book)) = crate::db::get_book_by_id(&self.db, completed.book_id).await {
                        guards.notification.send_to_all(&NotificationEvent::Import {
                            book,
                            file: readingroom_core::models::BookFile {
                                id: 0,
                                edition_id: 0,
                                path: String::new(),
                                size: 0,
                                quality: readingroom_core::models::Quality::Unknown,
                                format: String::new(),
                                media_info: None,
                                date_added: chrono::Utc::now(),
                                calibre_id: None,
                                part: None,
                            },
                        }).await;
                    }
                }
                Err(e) => {
                    db::update_queue_status_to(&self.db, queue_id, QueueStatus::Failed).await?;
                    tracing::error!(
                        queue_id = %queue_id,
                        error = %e,
                        "Failed to import completed download"
                    );
                }
            }
        }

        Ok(())
    }

    pub async fn list_queue(&self) -> Result<Vec<db::QueueEntry>> {
        db::list_queue(&self.db).await
    }

    pub async fn remove_download(&self, queue_id: i64) -> Result<bool> {
        let entry = db::get_queue_entry(&self.db, queue_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Queue entry not found".into()))?;

        let download_id = DownloadId(entry.download_id.clone());

        for client in &self.clients {
            if client.name() == entry.download_client {
                client.remove_download(&download_id).await.ok();
                break;
            }
        }

        db::delete_queue_entry(&self.db, queue_id).await
    }

    pub fn primary_client(&self) -> Option<&Box<dyn DownloadClient>> {
        self.clients.first()
    }
}
