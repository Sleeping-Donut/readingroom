use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{delete, get, put},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::AppState;

#[derive(Deserialize)]
pub struct SearchParams {
    pub q: String,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct AddAuthorBody {
    pub foreign_id: String,
    pub name: String,
}

#[derive(Deserialize)]
pub struct UpdateAuthorBody {
    pub monitored: Option<bool>,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/", get(list_authors).post(add_author))
        .route("/:id", get(get_author).put(update_author).delete(delete_author))
        .route("/:id/books", get(get_author_books))
        .route("/search", get(search_authors))
}

async fn list_authors(State(state): State<Arc<AppState>>) -> Json<Value> {
    match crate::db::list_authors(&state.db).await {
        Ok(authors) => Json(json!({ "authors": authors, "total": authors.len() })),
        Err(e) => Json(json!({ "error": e.to_string(), "authors": [], "total": 0 })),
    }
}

async fn add_author(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AddAuthorBody>,
) -> Json<Value> {
    if let Ok(Some(existing)) =
        crate::db::find_author_by_foreign_id(&state.db, &body.foreign_id).await
    {
        return Json(json!({ "author": existing, "already_exists": true }));
    }

    match crate::db::insert_author(&state.db, &body.foreign_id, &body.name).await {
        Ok(id) => {
            let author = readingroom_core::models::Author {
                id,
                foreign_id: body.foreign_id.clone(),
                name: body.name.clone(),
                sort_name: None,
                biography: None,
                image_url: None,
                birth_date: None,
                death_date: None,
                genres: vec![],
                aliases: vec![],
                links: vec![],
                monitored: true,
                added_at: chrono::Utc::now(),
                tags: vec![],
            };
            Json(json!({ "author": author, "already_exists": false }))
        }
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn get_author(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Json<Value> {
    // Try internal DB id first
    if let Ok(id64) = id.parse::<i64>() {
        if let Ok(Some(author)) = crate::db::get_author_by_id(&state.db, id64).await {
            return Json(json!(author));
        }
    }
    // Fallback to metadata source by foreign_id
    match state.metadata.get_author(&id).await {
        Ok(author) => Json(json!(author)),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn get_author_books(State(state): State<Arc<AppState>>, Path(id): Path<i64>) -> Json<Value> {
    match crate::db::get_books_by_author(&state.db, id).await {
        Ok(books) => Json(json!({ "books": books, "total": books.len() })),
        Err(e) => Json(json!({ "error": e.to_string(), "books": [], "total": 0 })),
    }
}

async fn update_author(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateAuthorBody>,
) -> Json<Value> {
    if let Some(monitored) = body.monitored {
        match crate::db::update_author_monitored(&state.db, id, monitored).await {
            Ok(true) => Json(json!({ "success": true })),
            Ok(false) => Json(json!({ "error": "Author not found" })),
            Err(e) => Json(json!({ "error": e.to_string() })),
        }
    } else {
        Json(json!({ "error": "No fields to update" }))
    }
}

async fn delete_author(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match crate::db::delete_author(&state.db, id).await {
        Ok(true) => Json(json!({ "success": true })),
        Ok(false) => Json(json!({ "error": "Author not found" })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn search_authors(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchParams>,
) -> Json<Value> {
    let results = state
        .metadata
        .search_author(&params.q)
        .await
        .unwrap_or_default();
    Json(json!({ "authors": results, "total": results.len() }))
}
