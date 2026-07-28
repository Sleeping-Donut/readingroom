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
    Router::<Arc<AppState>>::new()
        .route("/", get(list_books))
        .route("/:id", get(get_book))
        .route("/:id/editions", get(get_book_editions))
        .route("/search", get(search_books))
}

async fn list_books(State(_state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({ "books": [], "total": 0 }))
}

async fn get_book(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Json<Value> {
    match state.metadata.get_book(&id).await {
        Ok(book) => Json(json!(book)),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn get_book_editions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Json<Value> {
    match state.metadata.get_book_editions(&id).await {
        Ok(editions) => Json(json!({ "editions": editions, "total": editions.len() })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn search_books(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchParams>,
) -> Json<Value> {
    let results = state.metadata.search_book(&params.q).await.unwrap_or_default();
    Json(json!({ "books": results, "total": results.len() }))
}
