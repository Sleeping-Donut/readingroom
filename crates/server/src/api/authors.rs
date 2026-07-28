use axum::{Json, Router, extract::State, routing::get};
use serde_json::{Value, json};

async fn list_authors(State(_state): State<crate::AppState>) -> Json<Value> {
    Json(json!({
        "authors": [],
        "total": 0
    }))
}

pub fn router() -> Router<crate::AppState> {
    Router::new().route("/", get(list_authors))
}
