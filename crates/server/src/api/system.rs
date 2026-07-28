use axum::{Router, extract::State, routing::get};
use serde_json::json;

async fn status(State(state): State<crate::AppState>) -> impl axum::response::IntoResponse {
    axum::response::Json(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "name": "readingroom",
        "startup_path": state.config.server.data_dir,
        "auth_enabled": state.config.auth.enabled,
    }))
}

pub fn router() -> Router<crate::AppState> {
    Router::new().route("/status", get(status))
}
