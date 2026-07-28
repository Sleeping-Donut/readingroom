use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::get};
use serde_json::{Value, json};

use crate::AppState;

async fn status(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "readingroom",
        "startup_path": state.config.server.data_dir,
        "auth_enabled": state.config.auth.enabled,
    }))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new().route("/status", get(status))
}
