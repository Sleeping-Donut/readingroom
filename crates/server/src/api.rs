use std::sync::Arc;

use axum::{Router, response::IntoResponse, routing::get};
use serde_json::json;

use crate::AppState;

mod authors;
mod books;
mod search;
mod system;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .nest("/authors", authors::router())
        .nest("/books", books::router())
        .nest("/search", search::router())
        .nest("/system", system::router())
}

pub async fn static_handler() -> impl IntoResponse {
    axum::response::Json(json!({
        "error": "not_found",
        "message": "API endpoint not found"
    }))
}
