use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use readingroom_core::models::{MonitoredBook, Release};
use readingroom_core::traits::MetadataSource;

use crate::AppState;

#[derive(Deserialize)]
pub struct SearchAllParams {
    pub q: String,
    pub limit: Option<i64>,
}

async fn search_all(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchAllParams>,
) -> Json<Value> {
    let (authors, books) = tokio::join!(
        state.metadata.search_author(&params.q),
        state.metadata.search_book(&params.q),
    );

    Json(json!({
        "authors": authors.unwrap_or_default(),
        "books": books.unwrap_or_default(),
    }))
}

/// Search indexers for releases matching a query
async fn search_indexers(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchAllParams>,
) -> Json<Value> {
    // Search books via metadata first to find what we're looking for
    let books = state
        .metadata
        .search_book(&params.q)
        .await
        .unwrap_or_default();

    let mut all_results = Vec::new();

    for book in &books {
        // Metadata search results aren't in the DB — treat as monitored
        // so the user can search indexers for them.
        let monitored = MonitoredBook { inner: book.clone() };
        let results = state.search_engine.search_book(&monitored).await.unwrap_or_default();
        all_results.extend(results);
    }

    all_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    all_results.dedup_by(|a, b| a.release.download_url == b.release.download_url);

    Json(json!({
        "results": all_results,
        "total": all_results.len(),
        "books_found": books.len(),
    }))
}

/// Search indexers for an author's books
async fn search_author_indexers(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Json<Value> {
    let results = match crate::api::authors::resolve_author_id(&state, &id).await {
        Ok(author_id) => state.search_engine.search_author(author_id).await.unwrap_or_default(),
        Err(_) => vec![],
    };
    Json(json!({
        "results": results,
        "total": results.len(),
    }))
}

/// Search indexers for a specific book
async fn search_book_indexers(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let book = match crate::db::get_book_by_id(&state.db, id).await {
        Ok(Some(b)) => b,
        Ok(None) => return Json(json!({ "error": "Book not found", "results": [], "total": 0 })),
        Err(e) => return Json(json!({ "error": e.to_string(), "results": [], "total": 0 })),
    };

    let monitored = match book.into_monitored() {
        Some(m) => m,
        None => return Json(json!({ "error": "Book is not monitored", "results": [], "total": 0 })),
    };

    let results = state.search_engine.search_book(&monitored).await.unwrap_or_default();
    Json(json!({
        "results": results,
        "total": results.len(),
    }))
}

#[derive(Deserialize)]
pub struct DownloadReleaseBody {
    pub release: Release,
    pub book_id: i64,
}

/// Send a release to the download client
async fn download_release(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DownloadReleaseBody>,
) -> Json<Value> {
    match state
        .download_manager
        .download_release(&body.release, body.book_id)
        .await
    {
        Ok(queue_id) => Json(json!({ "queue_id": queue_id, "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/", get(search_all))
        .route("/indexers", get(search_indexers))
        .route("/indexers/authors/:id", post(search_author_indexers))
        .route("/indexers/books/:id", post(search_book_indexers))
        .route("/indexers/download", post(download_release))
}
