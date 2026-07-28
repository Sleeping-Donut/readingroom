use axum::{
    Router,
    response::IntoResponse,
    routing::get,
};
use serde_json::json;

mod authors;
mod books;
mod system;

pub fn router() -> Router<crate::AppState> {
    Router::new()
        .nest("/authors", authors::router())
        .nest("/books", books::router())
        .nest("/system", system::router())
}

pub async fn static_handler() -> impl IntoResponse {
    axum::response::Json(json!({
        "error": "not_found",
        "message": "API endpoint not found"
    }))
}
