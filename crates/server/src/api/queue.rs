use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{delete, get, post},
};
use serde_json::{Value, json};
use readingroom_core::models::Release;

use crate::AppState;
use crate::import::{ImportItem, ImportMode};

#[derive(serde::Deserialize)]
pub struct DownloadBody {
    pub release: Release,
    pub book_id: i64,
}

#[derive(serde::Deserialize)]
pub struct ImportBody {
    pub items: Vec<ImportItem>,
    #[serde(default)]
    pub import_mode: Option<String>,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/", get(list_queue))
        .route("/:id", delete(remove_from_queue))
        .route("/:id/candidates", get(get_candidates))
        .route("/:id/import", post(import_selected))
}

async fn list_queue(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.download_manager.list_queue().await {
        Ok(entries) => Json(json!({ "queue": entries, "total": entries.len() })),
        Err(e) => Json(json!({ "error": e.to_string(), "queue": [], "total": 0 })),
    }
}

/// Scan a completed download and return per-file import candidates.
async fn get_candidates(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.download_manager.scan_import_candidates(id).await {
        Ok(candidates) => {
            Json(json!({ "candidates": candidates, "total": candidates.len() }))
        }
        Err(e) => Json(json!({ "error": e.to_string(), "candidates": [] })),
    }
}

/// Import a user-resolved set of candidates.
async fn import_selected(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<ImportBody>,
) -> Json<Value> {
    let mode = match body.import_mode.as_deref() {
        Some("move") => ImportMode::Move,
        Some("hardlink") => ImportMode::Hardlink,
        _ => ImportMode::Copy,
    };
    match state
        .download_manager
        .import_selected(id, body.items, mode)
        .await
    {
        Ok(summary) => Json(json!({
            "success": true,
            "imported": summary.imported,
            "failed": summary.failed,
            "errors": summary.errors,
        })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn remove_from_queue(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.download_manager.remove_download(id).await {
        Ok(true) => Json(json!({ "success": true })),
        Ok(false) => Json(json!({ "error": "Queue entry not found" })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}
