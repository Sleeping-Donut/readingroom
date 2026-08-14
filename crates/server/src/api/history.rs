use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::get};
use serde_json::{Value, json};

use crate::AppState;

async fn list(State(state): State<Arc<AppState>>) -> Json<Value> {
    let history = crate::db::list_history(&state.db, 100).await.unwrap_or_default();
    Json(json!({ "history": history }))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(list))
}
