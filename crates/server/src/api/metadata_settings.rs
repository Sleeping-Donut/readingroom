use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    routing::{get, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};

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
        "stats": stats.map(|(counts, imported_at)| json!({ "counts": counts, "dump_imported_at": imported_at })),
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

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/metadata", get(get_metadata_settings).put(update_metadata_settings))
        .route("/metadata/download", post(trigger_download))
        .route("/metadata/check", post(check_updates))
}
