use std::sync::Arc;

use axum::{Router, response::IntoResponse};
use serde_json::json;

use crate::AppState;

mod auth;
mod authors;
mod books;
mod calendar;
mod history;
pub mod middleware;
mod notifications;
mod queue;
mod search;
mod import_lists;
mod settings;
mod system;
mod wanted;

pub fn router(state: Arc<AppState>) -> Router<Arc<AppState>> {
    let public = Router::<Arc<AppState>>::new()
        .nest("/auth", auth::router())
        .nest("/system", system::router());

    let protected = Router::<Arc<AppState>>::new()
        .nest("/authors", authors::router())
        .nest("/books", books::router())
        .nest("/calendar", calendar::router())
        .nest("/search", search::router())
        .nest("/queue", queue::router())
        .nest("/history", history::router())
        .nest("/wanted", wanted::router())
        .nest("/settings", settings::router())
        .nest("/import-lists", import_lists::router())
        .nest("/notifications", notifications::router())
        .route_layer(axum::middleware::from_fn_with_state(
            state,
            middleware::require_auth,
        ));

    Router::<Arc<AppState>>::new().merge(public).merge(protected)
}

pub async fn static_handler() -> impl IntoResponse {
    axum::response::Json(json!({
        "error": "not_found",
        "message": "API endpoint not found"
    }))
}
