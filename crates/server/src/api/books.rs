use axum::{Json, Router, extract::State, routing::get};
use serde_json::{Value, json};

async fn list_books(State(_state): State<crate::AppState>) -> Json<Value> {
    Json(json!({
        "books": [],
        "total": 0
    }))
}

pub fn router() -> Router<crate::AppState> {
    Router::new().route("/", get(list_books))
}
