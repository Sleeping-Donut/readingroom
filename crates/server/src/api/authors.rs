use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::get,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::AppState;

#[derive(Deserialize)]
pub struct SearchParams {
    pub q: String,
    pub limit: Option<i64>,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_authors))
        .route("/:id", get(get_author))
        .route("/search", get(search_authors))
}

async fn list_authors(State(_state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({ "authors": [], "total": 0 }))
}

async fn get_author(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Json<Value> {
    match state.metadata.get_author(&id).await {
        Ok(author) => Json(json!(author)),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn search_authors(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchParams>,
) -> Json<Value> {
    let results = state.metadata.search_author(&params.q).await.unwrap_or_default();
    Json(json!({ "authors": results, "total": results.len() }))
}
