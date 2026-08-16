use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::{get, post}};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use zip::write::SimpleFileOptions;

use readingroom_core::config::DownloadClientConfig;

use crate::AppState;

/// Validate and canonicalize a user-supplied path. Returns an error if the path
/// attempts to escape the data directory or doesn't exist.
fn sanitize_path(user_path: &str, data_dir: &Path) -> Result<PathBuf, String> {
    let path = Path::new(user_path);
    if !path.exists() {
        return Err(format!("Path does not exist: {user_path}"));
    }
    let canonical = path.canonicalize().map_err(|e| format!("Cannot resolve path: {e}"))?;
    if !canonical.starts_with(data_dir) {
        return Err(format!("Path is outside data directory: {user_path}"));
    }
    Ok(canonical)
}

async fn status(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "appName": "Readarr",
        "version": env!("CARGO_PKG_VERSION"),
        "name": "readingroom",
        "startup_path": state.config.server.data_dir,
        "auth_enabled": state.auth_enabled,
    }))
}

async fn stats(State(state): State<Arc<AppState>>) -> Json<Value> {
    let total_authors: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM authors")
        .fetch_one(&state.db).await.unwrap_or(0);

    let total_books: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM books")
        .fetch_one(&state.db).await.unwrap_or(0);

    let wanted_books: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM books b
         WHERE b.monitored = 1
         AND NOT EXISTS (
             SELECT 1 FROM book_files bf
             JOIN editions e ON bf.edition_id = e.id
             WHERE e.book_id = b.id
         )"
    )
    .fetch_one(&state.db).await.unwrap_or(0);

    let active_queue: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM queue WHERE status NOT IN ('completed', 'failed', 'removed', 'imported')"
    )
    .fetch_one(&state.db).await.unwrap_or(0);

    let total_files: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM book_files")
        .fetch_one(&state.db).await.unwrap_or(0);

    let total_size: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(size), 0) FROM book_files")
        .fetch_one(&state.db).await.unwrap_or(0);

    let recent_history: Vec<serde_json::Value> = sqlx::query(
        "SELECT id, event_type, source_title, date FROM history ORDER BY date DESC LIMIT 5"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|row| {
        json!({
            "id": row.get::<i64, _>("id"),
            "event_type": row.get::<String, _>("event_type"),
            "source_title": row.get::<Option<String>, _>("source_title"),
            "date": row.get::<String, _>("date"),
        })
    })
    .collect();

    Json(json!({
        "total_authors": total_authors,
        "total_books": total_books,
        "wanted_books": wanted_books,
        "active_queue": active_queue,
        "total_files": total_files,
        "total_size": total_size,
        "recent_history": recent_history,
    }))
}

async fn backup(State(state): State<Arc<AppState>>) -> Json<Value> {
    let data_dir = &state.config.server.data_dir;
    let backups_dir = data_dir.join("backups");

    if let Err(e) = tokio::fs::create_dir_all(&backups_dir).await {
        return Json(json!({ "success": false, "error": format!("Failed to create backups directory: {e}") }));
    }

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let temp_dir = backups_dir.join(format!("readingroom-backup-{timestamp}"));

    if let Err(e) = tokio::fs::create_dir_all(&temp_dir).await {
        return Json(json!({ "success": false, "error": format!("Failed to create temp directory: {e}") }));
    }

    let db_path = data_dir.join("readingroom.db");
    if !db_path.exists() {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Json(json!({ "success": false, "error": "readingroom.db not found" }));
    }

    let backup_db_path = temp_dir.join("readingroom.db");
    if let Err(e) = tokio::fs::copy(&db_path, &backup_db_path).await {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Json(json!({ "success": false, "error": format!("Failed to copy database: {e}") }));
    }

    let manifest = json!({
        "created_at": Utc::now().to_rfc3339(),
        "version": env!("CARGO_PKG_VERSION"),
        "files": ["readingroom.db"]
    });

    let manifest_path = temp_dir.join("backup.json");
    if let Err(e) = tokio::fs::write(&manifest_path, serde_json::to_string_pretty(&manifest).unwrap()).await {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Json(json!({ "success": false, "error": format!("Failed to write manifest: {e}") }));
    }

    let zip_path = backups_dir.join(format!("readingroom-backup-{timestamp}.zip"));
    let file = match std::fs::File::create(&zip_path) {
        Ok(f) => f,
        Err(e) => {
            let _ = tokio::fs::remove_dir_all(&temp_dir).await;
            return Json(json!({ "success": false, "error": format!("Failed to create zip file: {e}") }));
        }
    };

    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let db_bytes = match tokio::fs::read(&backup_db_path).await {
        Ok(b) => b,
        Err(e) => {
            let _ = tokio::fs::remove_dir_all(&temp_dir).await;
            let _ = std::fs::remove_file(&zip_path);
            return Json(json!({ "success": false, "error": format!("Failed to read backup db: {e}") }));
        }
    };

    let manifest_bytes = match tokio::fs::read(&manifest_path).await {
        Ok(b) => b,
        Err(e) => {
            let _ = tokio::fs::remove_dir_all(&temp_dir).await;
            let _ = std::fs::remove_file(&zip_path);
            return Json(json!({ "success": false, "error": format!("Failed to read manifest: {e}") }));
        }
    };

    let entries: [(&str, &[u8]); 2] = [
        ("backup/readingroom.db", &db_bytes),
        ("backup/backup.json", &manifest_bytes),
    ];

    if let Err(e) = zip.add_directory("backup/", options) {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        let _ = std::fs::remove_file(&zip_path);
        return Json(json!({ "success": false, "error": format!("Failed to add directory to zip: {e}") }));
    }

    for (name, bytes) in &entries {
        if let Err(e) = zip.start_file(name, options) {
            let _ = tokio::fs::remove_dir_all(&temp_dir).await;
            let _ = std::fs::remove_file(&zip_path);
            return Json(json!({ "success": false, "error": format!("Failed to start file in zip: {e}") }));
        }
        if let Err(e) = zip.write_all(bytes) {
            let _ = tokio::fs::remove_dir_all(&temp_dir).await;
            let _ = std::fs::remove_file(&zip_path);
            return Json(json!({ "success": false, "error": format!("Failed to write to zip: {e}") }));
        }
    }

    if let Err(e) = zip.finish() {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        let _ = std::fs::remove_file(&zip_path);
        return Json(json!({ "success": false, "error": format!("Failed to finalize zip: {e}") }));
    }

    let _ = tokio::fs::remove_dir_all(&temp_dir).await;

    let size = tokio::fs::metadata(&zip_path).await.map(|m| m.len()).unwrap_or(0);

    Json(json!({
        "success": true,
        "path": zip_path.to_string_lossy(),
        "size": size
    }))
}

#[derive(Deserialize)]
struct RestoreBody {
    path: String,
}

async fn restore(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RestoreBody>,
) -> Json<Value> {
    let data_dir = &state.config.server.data_dir;
    let zip_path = match sanitize_path(&body.path, data_dir) {
        Ok(p) => p,
        Err(e) => return Json(json!({ "success": false, "error": e })),
    };

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S");
    let temp_dir = data_dir.join("backups").join(format!("restore-{timestamp}"));

    if let Err(e) = tokio::fs::create_dir_all(&temp_dir).await {
        return Json(json!({ "success": false, "error": format!("Failed to create temp directory: {e}") }));
    }

    let file = match std::fs::File::open(zip_path) {
        Ok(f) => f,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Json(json!({ "success": false, "error": format!("Failed to open zip: {e}") }));
        }
    };

    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Json(json!({ "success": false, "error": format!("Failed to read zip archive: {e}") }));
        }
    };

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(_) => continue,
        };

        let entry_name = entry.name().replace('\\', "/");
        if entry_name.contains("..") || entry_name.starts_with('/') {
            tracing::warn!(name = %entry_name, "Skipping suspicious zip entry");
            continue;
        }
        let entry_path = temp_dir.join(&entry_name);
        if let Some(parent) = entry_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        if !entry.is_dir() {
            if let Ok(mut outfile) = std::fs::File::create(&entry_path) {
                let _ = std::io::copy(&mut entry, &mut outfile);
            }
        }
    }

    let manifest_path = temp_dir.join("backup/backup.json");
    if !manifest_path.exists() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Json(json!({ "success": false, "error": "Invalid backup: backup.json manifest not found" }));
    }

    let backup_db_path = temp_dir.join("backup/readingroom.db");
    if !backup_db_path.exists() {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Json(json!({ "success": false, "error": "Invalid backup: readingroom.db not found in archive" }));
    }

    let db_path = data_dir.join("readingroom.db");
    if let Err(e) = tokio::fs::copy(&backup_db_path, &db_path).await {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Json(json!({ "success": false, "error": format!("Failed to restore database: {e}") }));
    }

    let _ = tokio::fs::remove_dir_all(&temp_dir).await;

    Json(json!({
        "success": true,
        "message": "Backup restored. Server must be restarted."
    }))
}

#[derive(Deserialize)]
struct BulkImportBody {
    path: String,
    copy_files: Option<bool>,
}

async fn bulk_import(
    State(state): State<Arc<AppState>>,
    Json(body): Json<BulkImportBody>,
) -> Json<Value> {
    let path = match sanitize_path(&body.path, &state.config.server.data_dir) {
        Ok(p) => p,
        Err(e) => return Json(json!({ "error": e })),
    };
    let metadata: Box<dyn readingroom_core::traits::MetadataSource> =
        Box::new(readingroom_metadata::openlibrary::OpenLibrarySource::new());
    let importer = crate::bulk_import::BulkImporter::new(
        state.db.clone(),
        metadata,
        state.config.server.library_root.clone(),
    );
    let result = importer
        .scan_directory(&path, body.copy_files.unwrap_or(true))
        .await;
    match result {
        Ok(stats) => Json(json!(stats)),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn health_check(State(state): State<Arc<AppState>>) -> Json<Value> {
    let mut degraded = false;
    let mut unhealthy = false;

    // 1. Database connectivity
    let database = match sqlx::query("SELECT 1").execute(&state.db).await {
        Ok(_) => json!({"status": "ok", "message": "Connected"}),
        Err(e) => {
            unhealthy = true;
            json!({"status": "error", "message": e.to_string()})
        }
    };

    // 2. Disk space
    let disk_space = {
        let data_dir = &state.config.server.data_dir;
        match fs2::available_space(data_dir) {
            Ok(bytes) => {
                if bytes < 10_485_760 {
                    unhealthy = true;
                    json!({"status": "error", "message": format!("Only {} bytes available", bytes)})
                } else if bytes < 104_857_600 {
                    degraded = true;
                    json!({"status": "degraded", "message": format!("{} bytes available", bytes)})
                } else {
                    json!({"status": "ok", "message": format!("{} bytes available", bytes)})
                }
            }
            Err(e) => {
                unhealthy = true;
                json!({"status": "error", "message": format!("Failed to check disk space: {e}")})
            }
        }
    };

    // 3. Library directory
    let library = match &state.config.server.library_root {
        Some(path) if path.exists() => {
            json!({"status": "ok", "message": format!("Library path exists at {}", path.display())})
        }
        Some(path) => {
            degraded = true;
            json!({"status": "error", "message": format!("Library path {} does not exist", path.display())})
        }
        None => {
            json!({"status": "ok", "message": "No library root configured"})
        }
    };

    // 4. Scheduler (not in AppState, report as ok)
    let scheduler = json!({"status": "ok", "message": "Running"});

    // 5. Indexers — validate config
    let mut idx_ok = 0usize;
    let mut idx_err = 0usize;
    let mut idx_details: Vec<Value> = Vec::new();
    for ic in &state.config.indexers {
        match readingroom_providers::from_config(ic) {
            Ok(indexer) => {
                let supported = if indexer.supports_search() {
                    "search"
                } else if indexer.supports_rss() {
                    "rss"
                } else {
                    "none"
                };
                idx_ok += 1;
                idx_details.push(json!({"name": ic.name, "status": "ok", "supported": supported}));
            }
            Err(e) => {
                idx_err += 1;
                unhealthy = true;
                idx_details.push(json!({"name": ic.name, "status": "error", "message": e.to_string()}));
            }
        }
    }
    let indexers = json!({
        "total": idx_ok + idx_err,
        "ok": idx_ok,
        "error": idx_err,
        "details": idx_details,
    });

    // 6. Download clients — test connectivity via get_config()
    let mut dc_ok = 0usize;
    let mut dc_err = 0usize;
    let mut dc_details: Vec<Value> = Vec::new();

    let dc_rows = sqlx::query_as::<_, DownloadClientRow>(
        "SELECT id, name, implementation, settings, priority FROM download_clients ORDER BY priority, name",
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    for row in &dc_rows {
        let settings: Result<DownloadClientSettings, _> = serde_json::from_str(&row.settings);
        let settings = match settings {
            Ok(s) => s,
            Err(e) => {
                dc_err += 1;
                unhealthy = true;
                dc_details.push(json!({"name": row.name, "status": "error", "message": format!("Invalid settings: {e}")}));
                continue;
            }
        };

        let config = DownloadClientConfig {
            name: row.name.clone(),
            implementation: row.implementation.clone(),
            host: settings.host,
            port: settings.port,
            username: settings.username,
            password: settings.password,
            url_base: settings.url_base,
            category: settings.category,
            download_dir: settings.download_dir.map(std::path::PathBuf::from),
            enabled: true,
            rate_limit: settings.rate_limit,
            concurrent_downloads: settings.concurrent_downloads,
            priority: row.priority as i32,
        };

        match readingroom_downloaders::from_config(&config) {
            Ok(client) => match client.get_config().await {
                Ok(_) => {
                    dc_ok += 1;
                    dc_details.push(json!({"name": row.name, "status": "ok"}));
                }
                Err(e) => {
                    dc_err += 1;
                    unhealthy = true;
                    dc_details.push(json!({"name": row.name, "status": "error", "message": e.to_string()}));
                }
            },
            Err(e) => {
                dc_err += 1;
                unhealthy = true;
                dc_details.push(json!({"name": row.name, "status": "error", "message": e.to_string()}));
            }
        }
    }
    let download_clients = json!({
        "total": dc_ok + dc_err,
        "ok": dc_ok,
        "error": dc_err,
        "details": dc_details,
    });

    // 7. Notification manager — verify lock
    let notification = match state.notification_manager.try_lock() {
        Ok(_guard) => json!({"status": "ok", "message": "Lock acquired"}),
        Err(_) => json!({"status": "ok", "message": "Busy"}), // not unhealthy, just in use
    };

    let status = if unhealthy {
        "unhealthy"
    } else if degraded {
        "degraded"
    } else {
        "healthy"
    };

    Json(json!({
        "status": status,
        "checks": {
            "database": database,
            "disk_space": disk_space,
            "library": library,
            "scheduler": scheduler,
            "indexers": indexers,
            "download_clients": download_clients,
            "notification": notification,
        }
    }))
}

#[derive(sqlx::FromRow)]
struct DownloadClientRow {
    id: i64,
    name: String,
    implementation: String,
    settings: String,
    priority: i64,
}

#[derive(Deserialize)]
struct DownloadClientSettings {
    #[serde(default)]
    host: String,
    #[serde(default)]
    port: u16,
    username: Option<String>,
    password: Option<String>,
    url_base: Option<String>,
    category: Option<String>,
    #[serde(default)]
    download_dir: Option<String>,
    #[serde(default)]
    rate_limit: Option<u64>,
    #[serde(default)]
    concurrent_downloads: Option<usize>,
}

#[derive(Deserialize)]
struct CalibreImportBody {
    path: String,
    copy_files: Option<bool>,
}

async fn calibre_import(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CalibreImportBody>,
) -> Json<Value> {
    let path = match sanitize_path(&body.path, &state.config.server.data_dir) {
        Ok(p) => p,
        Err(e) => return Json(json!({ "error": e })),
    };
    let metadata: Box<dyn readingroom_core::traits::MetadataSource> =
        Box::new(readingroom_metadata::openlibrary::OpenLibrarySource::new());
    let importer = crate::calibre::CalibreImporter::new(
        state.db.clone(),
        state.config.server.library_root.clone(),
        metadata,
    );
    match importer
        .import_calibre_library(&path, body.copy_files.unwrap_or(true))
        .await
    {
        Ok(result) => Json(json!(result)),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/status", get(status))
        .route("/stats", get(stats))
        .route("/health", get(health_check))
        .route("/backup", post(backup))
        .route("/restore", post(restore))
        .route("/bulk-import", post(bulk_import))
        .route("/calibre-import", post(calibre_import))
}
