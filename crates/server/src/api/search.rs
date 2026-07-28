use std::sync::Arc;

use axum::{Json, Router, extract::{Query, State}, routing::get};
use serde::Deserialize;
use serde_json::{Value, json};

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

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new().route("/", get(search_all))
}
