use axum::{
    Json, Router, body::Body, extract::State, http::Request, response::IntoResponse, routing::{get, post},
};
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

use readingroom_core::{error::Result, models::Author};

struct AppState {
    db: sqlx::SqlitePool,
}

async fn health() -> impl IntoResponse {
    (axum::http::StatusCode::OK, "OK")
}

async fn list_authors(State(state): State<Arc<AppState>>) -> Json<Value> {
    let rows = sqlx::query_as::<_, AuthorRow>(
        "SELECT id, foreign_id, name, sort_name, biography, image_url,
                birth_date, death_date, genres, aliases, links,
                monitored, added_at, tags
         FROM authors ORDER BY name"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let authors: Vec<Author> = rows.into_iter().map(|r| r.into_domain()).collect();
    Json(json!({ "authors": authors, "total": authors.len() }))
}

async fn add_author(State(state): State<Arc<AppState>>, Json(body): Json<AddAuthorBody>) -> Json<Value> {
    let result = sqlx::query(
        "INSERT INTO authors (foreign_id, name, sort_name, monitored, added_at, updated_at)
         VALUES (?1, ?2, ?3, 1, datetime('now'), datetime('now'))",
    )
    .bind(&body.foreign_id)
    .bind(&body.name)
    .bind(&body.name)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) => Json(json!({ "id": r.last_insert_rowid(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

#[derive(serde::Deserialize)]
struct AddAuthorBody {
    foreign_id: String,
    name: String,
}

#[derive(sqlx::FromRow)]
struct AuthorRow {
    id: i64,
    foreign_id: String,
    name: String,
    sort_name: Option<String>,
    biography: Option<String>,
    image_url: Option<String>,
    birth_date: Option<String>,
    death_date: Option<String>,
    genres: String,
    aliases: String,
    links: String,
    monitored: bool,
    added_at: String,
    tags: String,
}

impl AuthorRow {
    fn into_domain(self) -> Author {
        Author {
            id: self.id,
            foreign_id: self.foreign_id,
            name: self.name,
            sort_name: self.sort_name,
            biography: self.biography,
            image_url: self.image_url,
            birth_date: self.birth_date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok()),
            death_date: self.death_date.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok()),
            genres: serde_json::from_str(&self.genres).unwrap_or_default(),
            aliases: serde_json::from_str(&self.aliases).unwrap_or_default(),
            links: serde_json::from_str(&self.links).unwrap_or_default(),
            monitored: self.monitored,
            added_at: chrono::DateTime::parse_from_rfc3339(&self.added_at)
                .map(|d| d.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now()),
            tags: serde_json::from_str::<Vec<String>>(&self.tags)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|t| t.parse().ok())
                .collect(),
        }
    }
}

fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/authors", get(list_authors).post(add_author))
        .with_state(state)
}

async fn setup_test_db() -> Arc<AppState> {
    let pool = readingroom_db::connect_test().await.unwrap();
    Arc::new(AppState { db: pool })
}

#[tokio::test]
async fn test_health_endpoint() {
    let state = setup_test_db().await;
    let app = router(state);

    let response = app
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), 200);
}

#[tokio::test]
async fn test_list_authors_empty() {
    let state = setup_test_db().await;
    let app = router(state);

    let response = app
        .oneshot(Request::builder().uri("/authors").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), 200);
    let body: Value = serde_json::from_slice(
        &axum::body::to_bytes(response.into_body(), 1024 * 10).await.unwrap()
    ).unwrap();
    assert_eq!(body["total"], 0);
    assert!(body["authors"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn test_add_and_list_author() {
    let state = setup_test_db().await;
    let app = router(state);

    // Add an author
    let add_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/authors")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"foreign_id": "OL123W", "name": "Test Author"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(add_resp.status(), 200);
    let add_body: Value = serde_json::from_slice(
        &axum::body::to_bytes(add_resp.into_body(), 1024 * 10).await.unwrap()
    ).unwrap();
    assert_eq!(add_body["success"], true);
    assert!(add_body["id"].as_i64().is_some_and(|id| id > 0));

    // List authors
    let list_resp = app
        .oneshot(Request::builder().uri("/authors").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(list_resp.status(), 200);
    let list_body: Value = serde_json::from_slice(
        &axum::body::to_bytes(list_resp.into_body(), 1024 * 10).await.unwrap()
    ).unwrap();
    assert_eq!(list_body["total"], 1);
    assert_eq!(list_body["authors"][0]["name"], "Test Author");
}

#[tokio::test]
async fn test_add_duplicate_author() {
    let state = setup_test_db().await;
    let app = router(state);

    // Add once
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/authors")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"foreign_id": "OL123W", "name": "Test Author"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    // Duplicate foreign_id
    let dup_resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/authors")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"foreign_id": "OL123W", "name": "Test Author"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    let dup_body: Value = serde_json::from_slice(
        &axum::body::to_bytes(dup_resp.into_body(), 1024 * 10).await.unwrap()
    ).unwrap();
    // Should fail due to UNIQUE constraint
    assert_eq!(dup_body["success"], false);
}
