use std::sync::Arc;

use axum::{Json, Router, extract::{Path, State}, routing::{get, post}};
use serde_json::{Value, json};

use crate::AppState;

async fn list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match crate::db::list_wanted_books(&state.db).await {
        Ok(books) => {
            let total = books.len();
            Json(json!({ "books": books, "total": total }))
        }
        Err(e) => Json(json!({ "error": e.to_string(), "books": [], "total": 0 })),
    }
}

async fn search_all(State(state): State<Arc<AppState>>) -> Json<Value> {
    match crate::scheduler::search_missing_books(&state.db, state.search_engine.as_ref(), &state.download_manager).await {
        Ok(()) => Json(json!({ "status": "ok", "message": "Search triggered for all wanted books" })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn search_book(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let book = match crate::db::get_book_by_id(&state.db, id).await {
        Ok(Some(b)) => b,
        Ok(None) => return Json(json!({ "error": "Book not found" })),
        Err(e) => return Json(json!({ "error": e.to_string() })),
    };

    let book_id = book.id;
    let monitored = match book.into_monitored() {
        Some(m) => m,
        None => return Json(json!({ "error": "Book is not monitored" })),
    };

    let results = match state.search_engine.search_book(&monitored).await {
        Ok(r) => r,
        Err(e) => return Json(json!({ "error": e.to_string(), "results": [], "total": 0 })),
    };

    if let Some(best) = results.iter().find(|r| r.score > 50.0) {
        match state.download_manager.download_release(&best.release, book_id).await {
            Ok(queue_id) => {
                let total = results.len();
                Json(json!({
                    "status": "downloaded",
                    "queue_id": queue_id,
                    "release": &best.release,
                    "score": best.score,
                    "results": results,
                    "total": total,
                }))
            }
            Err(e) => Json(json!({ "error": e.to_string(), "results": results, "total": results.len() })),
        }
    } else {
        Json(json!({
            "status": "no_match",
            "message": "No release scored above threshold",
            "results": results,
            "total": results.len(),
        }))
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list))
        .route("/search", post(search_all))
        .route("/search/:id", post(search_book))
}
