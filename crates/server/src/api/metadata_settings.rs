use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Multipart, State},
    routing::{get, post, put},
};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::io::AsyncWriteExt;

use crate::{AppState, local_cache};

// ---------------------------------------------------------------------------
// Metadata source settings (online vs local dump cache)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct UpdateMetadataBody {
    pub mode: Option<String>,
    pub auto_update: Option<bool>,
    pub dump_url: Option<String>,
}

async fn settings_response(state: &Arc<AppState>) -> Value {
    let settings = local_cache::load_settings(&state.db).await;
    let status = state.local_cache.progress();
    let stats = state.local_cache.stats().await.ok();
    json!({
        "success": true,
        "mode": settings.mode,
        "auto_update": settings.auto_update,
        "dump_url": settings.dump_url,
        "offline_ready": !state.local_cache.is_running()
            && stats.as_ref().map(|(c, _)| c.works > 0 || c.editions > 0).unwrap_or(false),
        "status": status,
        "stats": stats.map(|(counts, meta)| json!({ "counts": counts, "meta": meta })),
    })
}

async fn get_metadata_settings(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(settings_response(&state).await)
}

async fn update_metadata_settings(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UpdateMetadataBody>,
) -> Json<Value> {
    let mut settings = local_cache::load_settings(&state.db).await;
    if let Some(mode) = body.mode {
        if mode != "online" && mode != "offline" {
            return Json(json!({ "success": false, "error": "mode must be 'online' or 'offline'" }));
        }
        settings.mode = mode;
    }
    if let Some(v) = body.auto_update {
        settings.auto_update = v;
    }
    if let Some(url) = body.dump_url {
        if !url.trim().is_empty() {
            settings.dump_url = url.trim().to_string();
        }
    }

    if let Err(e) = local_cache::save_settings(&state.db, &settings).await {
        return Json(json!({ "success": false, "error": e.to_string() }));
    }

    let offline = settings.mode == "offline";
    state.metadata.set_offline_mode(offline);
    if offline {
        state.local_cache.ensure_downloaded().await;
    }
    tracing::info!(mode = %settings.mode, auto_update = settings.auto_update, "Metadata source settings updated");

    Json(settings_response(&state).await)
}

/// Start (or restart) the dump download+import in the background.
async fn trigger_download(State(state): State<Arc<AppState>>) -> Json<Value> {
    let settings = local_cache::load_settings(&state.db).await;
    let started = state.local_cache.request_download(settings.dump_url.clone());
    Json(json!({ "success": true, "started": started }))
}

/// Check whether a newer dump exists; trigger a re-import if so.
async fn check_updates(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.local_cache.check_for_updates().await {
        Ok(check) => Json(json!({ "success": true, "check": check })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

/// Upload a dump file from the WebUI and import it into the cache in the
/// background. Streams the multipart body to disk so multi-GB files don't need
/// to fit in memory.
async fn upload_dump(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Json<Value> {
    if state.local_cache.is_running() {
        return Json(json!({ "success": false, "started": false, "error": "A download/import is already running." }));
    }
    let path = state.local_cache.dump_upload_path();
    let mut written = false;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() != Some("file") {
            continue;
        }
        let mut file = match tokio::fs::File::create(&path).await {
            Ok(f) => f,
            Err(e) => return Json(json!({ "success": false, "error": format!("Cannot write upload: {e}") })),
        };
        let mut field = field;
        while let Some(chunk) = field.next().await {
            match chunk {
                Ok(bytes) => {
                    if let Err(e) = file.write_all(&bytes).await {
                        return Json(json!({ "success": false, "error": format!("Upload write failed: {e}") }));
                    }
                }
                Err(e) => return Json(json!({ "success": false, "error": format!("Upload failed: {e}") })),
            }
        }
        if let Err(e) = file.flush().await {
            return Json(json!({ "success": false, "error": format!("Upload flush failed: {e}") }));
        }
        written = true;
        break;
    }

    if !written {
        let _ = tokio::fs::remove_file(&path).await;
        return Json(json!({ "success": false, "error": "No file field named 'file' in the upload." }));
    }

    let started = state.local_cache.request_import_from_file(path);
    Json(json!({ "success": true, "started": started }))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/metadata", get(get_metadata_settings).put(update_metadata_settings))
        .route("/metadata/download", post(trigger_download))
        .route("/metadata/check", post(check_updates))
        .route("/metadata/upload", post(upload_dump))
}
