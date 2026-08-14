use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{delete, get},
};
use serde_json::{Value, json};
use readingroom_core::models::Release;

use crate::AppState;

#[derive(serde::Deserialize)]
pub struct DownloadBody {
    pub release: Release,
    pub book_id: i64,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/", get(list_queue))
        .route("/:id", delete(remove_from_queue))
}

async fn list_queue(State(state): State<Arc<AppState>>) -> Json<Value> {
    match state.download_manager.list_queue().await {
        Ok(entries) => Json(json!({ "queue": entries, "total": entries.len() })),
        Err(e) => Json(json!({ "error": e.to_string(), "queue": [], "total": 0 })),
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
