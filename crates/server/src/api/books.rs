use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;

use crate::AppState;

#[derive(Deserialize)]
pub struct SearchParams {
    pub q: String,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct AddBookBody {
    pub foreign_id: String,
    pub author_id: i64,
    pub title: String,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/", get(list_books).post(add_book))
        .route("/:id", get(get_book))
        .route("/:id/editions", get(get_book_editions))
        .route("/:id/convert", post(convert_book))
        .route("/search", get(search_books))
}

async fn list_books(State(state): State<Arc<AppState>>) -> Json<Value> {
    match crate::db::list_books(&state.db).await {
        Ok(books) => Json(json!({ "books": books, "total": books.len() })),
        Err(e) => Json(json!({ "error": e.to_string(), "books": [], "total": 0 })),
    }
}

async fn add_book(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AddBookBody>,
) -> Json<Value> {
    if let Ok(Some(existing)) =
        crate::db::find_book_by_foreign_id(&state.db, &body.foreign_id).await
    {
        return Json(json!({ "book": existing, "already_exists": true }));
    }

    let title = body.title;
    let clean_title = title.to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != ' ', "");
    match crate::db::insert_book(&state.db, &body.foreign_id, body.author_id, &title, &clean_title).await {
        Ok(id) => {
            let book = readingroom_core::models::Book {
                id,
                foreign_id: body.foreign_id,
                author_id: body.author_id,
                title,
                clean_title,
                description: None,
                isbn: None,
                isbn13: None,
                asin: None,
                pages: None,
                publisher: None,
                publish_date: None,
                image_url: None,
                genres: vec![],
                ratings: None,
                language: "en".into(),
                monitored: true,
                added_at: chrono::Utc::now(),
                last_search_at: None,
            };
            Json(json!({ "book": book, "already_exists": false }))
        }
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn get_book(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Json<Value> {
    if let Ok(id64) = id.parse::<i64>() {
        if let Ok(Some(book)) = crate::db::get_book_by_id(&state.db, id64).await {
            return Json(json!(book));
        }
    }
    match state.metadata.get_book(&id).await {
        Ok(book) => Json(json!(book)),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn get_book_editions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Json<Value> {
    let foreign_id = if let Ok(id64) = id.parse::<i64>() {
        if let Ok(Some(book)) = crate::db::get_book_by_id(&state.db, id64).await {
            book.foreign_id
        } else {
            id.clone()
        }
    } else {
        id.clone()
    };

    match state.metadata.get_book_editions(&foreign_id).await {
        Ok(editions) => Json(json!({ "editions": editions, "total": editions.len() })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn search_books(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SearchParams>,
) -> Json<Value> {
    let results = state.metadata.search_book(&params.q).await.unwrap_or_default();
    Json(json!({ "books": results, "total": results.len() }))
}

#[derive(Deserialize)]
struct ConvertBody {
    format: String,
}

async fn convert_book(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<ConvertBody>,
) -> Json<Value> {
    let _book = match crate::db::get_book_by_id(&state.db, id).await {
        Ok(Some(b)) => b,
        Ok(None) => return Json(json!({ "error": "Book not found" })),
        Err(e) => return Json(json!({ "error": e.to_string() })),
    };

    let file = sqlx::query(
        "SELECT bf.id, bf.path, bf.format, bf.quality FROM book_files bf
         JOIN editions e ON bf.edition_id = e.id
         WHERE e.book_id = ?1 ORDER BY bf.id LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let file = match file {
        Ok(Some(row)) => row,
        Ok(None) => return Json(json!({ "error": "No files found for this book" })),
        Err(e) => return Json(json!({ "error": e.to_string() })),
    };

    let source_path: String = file.get("path");
    let source_quality: String = file.get("quality");
    let source = std::path::Path::new(&source_path);

    if !source.exists() {
        return Json(json!({ "error": "Source file not found on disk" }));
    }

    let target_format = body.format.to_lowercase();
    match crate::converter::convert_file(source, &target_format).await {
        Ok(target_path) => {
            let file_size = tokio::fs::metadata(&target_path).await.map(|m| m.len() as i64).unwrap_or(0);
            let edition_id = sqlx::query_scalar::<_, i64>(
                "SELECT id FROM editions WHERE book_id = ?1 LIMIT 1",
            )
            .bind(id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .unwrap_or(0);

            if edition_id > 0 {
                let _ = crate::db::insert_book_file(
                    &state.db,
                    edition_id,
                    &target_path.to_string_lossy(),
                    file_size,
                    &source_quality,
                    &target_format,
                )
                .await;
            }

            Json(json!({
                "success": true,
                "path": target_path.to_string_lossy(),
                "size": file_size,
                "format": target_format,
            }))
        }
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}
