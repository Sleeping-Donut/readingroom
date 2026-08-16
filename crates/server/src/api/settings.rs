use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{delete, get, post, put},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use readingroom_core::config::{DownloadClientConfig, IndexerConfig, LibraryConfig};
use readingroom_core::error::Result;

use crate::AppState;

// ---------------------------------------------------------------------------
// Library settings (download locations + naming)
// ---------------------------------------------------------------------------

/// Partial update body for library settings. Absent fields keep their current value.
#[derive(Debug, Deserialize)]
pub struct UpdateLibraryBody {
    pub root_folder: Option<std::path::PathBuf>,
    pub audiobook_folder: Option<std::path::PathBuf>,
    pub rename_files: Option<bool>,
    pub author_folder_format: Option<String>,
    pub book_file_format: Option<String>,
}

async fn load_library_config(state: &Arc<AppState>) -> LibraryConfig {
    match crate::db::get_config_value(&state.db, "library").await {
        Ok(Some(json)) => serde_json::from_str::<LibraryConfig>(&json)
            .unwrap_or_else(|_| state.config.library.clone()),
        _ => state.config.library.clone(),
    }
}

async fn get_library_settings(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({ "success": true, "library": load_library_config(&state).await }))
}

async fn get_integration_settings(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "success": true,
        "api_key": state.api_key.clone().unwrap_or_default(),
    }))
}

async fn update_library_settings(
    State(state): State<Arc<AppState>>,
    Json(body): Json<UpdateLibraryBody>,
) -> Json<Value> {
    let mut lib = load_library_config(&state).await;
    if let Some(v) = body.root_folder {
        lib.root_folder = Some(v);
    }
    if let Some(v) = body.audiobook_folder {
        lib.audiobook_folder = Some(v);
    }
    if let Some(v) = body.rename_files {
        lib.rename_files = v;
    }
    if let Some(v) = body.author_folder_format {
        lib.author_folder_format = Some(v);
    }
    if let Some(v) = body.book_file_format {
        lib.book_file_format = Some(v);
    }

    let value = serde_json::to_string(&lib).unwrap_or_else(|_| "{}".into());
    match crate::db::set_config_value(&state.db, "library", &value).await {
        Ok(()) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

// ---------------------------------------------------------------------------
// Indexer CRUD
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct IndexerRow {
    pub id: i64,
    pub name: String,
    pub implementation: String,
    pub settings: String,
    pub enable_rss: bool,
    pub enable_search: bool,
    pub priority: i64,
    pub tags: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateIndexerBody {
    pub name: String,
    pub implementation: String,
    pub settings: Option<String>,
    pub enable_rss: Option<bool>,
    pub enable_search: Option<bool>,
    pub priority: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateIndexerBody {
    pub name: Option<String>,
    pub implementation: Option<String>,
    pub settings: Option<String>,
    pub enable_rss: Option<bool>,
    pub enable_search: Option<bool>,
    pub priority: Option<i64>,
}

async fn list_indexers(State(state): State<Arc<AppState>>) -> Json<Value> {
    let rows = sqlx::query_as::<_, IndexerRow>(
        "SELECT id, name, implementation, settings, enable_rss, enable_search, priority, tags, created_at
         FROM indexers ORDER BY priority, name",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(indexers) => Json(json!({ "indexers": indexers })),
        Err(e) => Json(json!({ "error": e.to_string(), "indexers": [] })),
    }
}

async fn create_indexer(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateIndexerBody>,
) -> Json<Value> {
    let result = sqlx::query(
        "INSERT INTO indexers (name, implementation, settings, enable_rss, enable_search, priority)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(&body.name)
    .bind(&body.implementation)
    .bind(body.settings.as_deref().unwrap_or("{}"))
    .bind(body.enable_rss.unwrap_or(true))
    .bind(body.enable_search.unwrap_or(true))
    .bind(body.priority.unwrap_or(0))
    .execute(&state.db)
    .await;

    match result {
        Ok(r) => Json(json!({ "id": r.last_insert_rowid(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

async fn get_indexer(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let row = sqlx::query_as::<_, IndexerRow>(
        "SELECT id, name, implementation, settings, enable_rss, enable_search, priority, tags, created_at
         FROM indexers WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(indexer)) => Json(json!(indexer)),
        Ok(None) => Json(json!({ "error": "Indexer not found" })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn update_indexer(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateIndexerBody>,
) -> Json<Value> {
    // Read current state
    let current = sqlx::query_as::<_, IndexerRow>(
        "SELECT id, name, implementation, settings, enable_rss, enable_search, priority, tags, created_at
         FROM indexers WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let current = match current {
        Ok(Some(c)) => c,
        Ok(None) => return Json(json!({ "error": "Indexer not found", "success": false })),
        Err(e) => return Json(json!({ "error": e.to_string(), "success": false })),
    };

    let name = body.name.unwrap_or(current.name);
    let implementation = body.implementation.unwrap_or(current.implementation);
    let settings = body.settings.unwrap_or(current.settings);
    let enable_rss = body.enable_rss.unwrap_or(current.enable_rss);
    let enable_search = body.enable_search.unwrap_or(current.enable_search);
    let priority = body.priority.unwrap_or(current.priority);

    match sqlx::query(
        "UPDATE indexers SET name = ?1, implementation = ?2, settings = ?3,
         enable_rss = ?4, enable_search = ?5, priority = ?6 WHERE id = ?7",
    )
    .bind(&name)
    .bind(&implementation)
    .bind(&settings)
    .bind(enable_rss)
    .bind(enable_search)
    .bind(priority)
    .bind(id)
    .execute(&state.db)
    .await
    {
        Ok(r) => Json(json!({ "rows_affected": r.rows_affected(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

async fn delete_indexer(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match sqlx::query("DELETE FROM indexers WHERE id = ?1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        Ok(r) => Json(json!({ "rows_affected": r.rows_affected(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

// ---------------------------------------------------------------------------
// Download Client CRUD
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct DownloadClientRow {
    pub id: i64,
    pub name: String,
    pub implementation: String,
    pub settings: String,
    pub enabled: bool,
    pub priority: i64,
    pub tags: String,
    pub created_at: String,
}

async fn list_download_clients(State(state): State<Arc<AppState>>) -> Json<Value> {
    let rows = sqlx::query_as::<_, DownloadClientRow>(
        "SELECT id, name, implementation, settings, enabled, priority, tags, created_at
         FROM download_clients ORDER BY priority, name",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(clients) => Json(json!({ "download_clients": clients })),
        Err(e) => Json(json!({ "error": e.to_string(), "download_clients": [] })),
    }
}

async fn create_download_client(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateDownloadClientBody>,
) -> Json<Value> {
    let result = sqlx::query(
        "INSERT INTO download_clients (name, implementation, settings, priority, enabled)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(&body.name)
    .bind(&body.implementation)
    .bind(body.settings.as_deref().unwrap_or("{}"))
    .bind(body.priority.unwrap_or(0))
    .bind(body.enabled.unwrap_or(true))
    .execute(&state.db)
    .await;

    match result {
        Ok(r) => Json(json!({ "id": r.last_insert_rowid(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateDownloadClientBody {
    pub name: String,
    pub implementation: String,
    pub settings: Option<String>,
    pub priority: Option<i64>,
    pub enabled: Option<bool>,
}

async fn get_download_client(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let row = sqlx::query_as::<_, DownloadClientRow>(
        "SELECT id, name, implementation, settings, enabled, priority, tags, created_at
         FROM download_clients WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(client)) => Json(json!(client)),
        Ok(None) => Json(json!({ "error": "Download client not found" })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn delete_download_client(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match sqlx::query("DELETE FROM download_clients WHERE id = ?1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        Ok(r) => Json(json!({ "rows_affected": r.rows_affected(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

#[derive(Debug, Deserialize)]
pub struct UpdateDownloadClientBody {
    pub name: Option<String>,
    pub implementation: Option<String>,
    pub settings: Option<String>,
    pub priority: Option<i64>,
    pub enabled: Option<bool>,
}

async fn update_download_client(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateDownloadClientBody>,
) -> Json<Value> {
    let current = sqlx::query_as::<_, DownloadClientRow>(
        "SELECT id, name, implementation, settings, enabled, priority, tags, created_at
         FROM download_clients WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let current = match current {
        Ok(Some(c)) => c,
        Ok(None) => return Json(json!({ "error": "Download client not found", "success": false })),
        Err(e) => return Json(json!({ "error": e.to_string(), "success": false })),
    };

    let name = body.name.unwrap_or(current.name);
    let implementation = body.implementation.unwrap_or(current.implementation);
    let settings = body.settings.unwrap_or(current.settings);
    let priority = body.priority.unwrap_or(current.priority);
    let enabled = body.enabled.unwrap_or(current.enabled);

    match sqlx::query(
        "UPDATE download_clients SET name = ?1, implementation = ?2, settings = ?3, priority = ?4, enabled = ?5 WHERE id = ?6",
    )
    .bind(&name)
    .bind(&implementation)
    .bind(&settings)
    .bind(priority)
    .bind(enabled)
    .bind(id)
    .execute(&state.db)
    .await
    {
        Ok(r) => Json(json!({ "rows_affected": r.rows_affected(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

// ---------------------------------------------------------------------------
// Test Connectivity
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct DownloadClientSettings {
    #[serde(default)]
    host: String,
    #[serde(default)]
    port: u16,
    username: Option<String>,
    password: Option<String>,
    url_base: Option<String>,
    category: Option<String>,
    #[serde(default)]
    download_dir: Option<String>,
    #[serde(default)]
    rate_limit: Option<u64>,
    #[serde(default)]
    concurrent_downloads: Option<usize>,
}

#[derive(Deserialize)]
struct IndexerSettings {
    url: String,
    api_key: Option<String>,
}

async fn test_indexer(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let row = sqlx::query_as::<_, IndexerRow>(
        "SELECT id, name, implementation, settings, enable_rss, enable_search, priority, tags, created_at
         FROM indexers WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let row = match row {
        Ok(Some(r)) => r,
        Ok(None) => return Json(json!({ "success": false, "error": "Indexer not found" })),
        Err(e) => return Json(json!({ "success": false, "error": e.to_string() })),
    };

    let settings: IndexerSettings = match serde_json::from_str(&row.settings) {
        Ok(s) => s,
        Err(e) => return Json(json!({ "success": false, "error": format!("Invalid settings JSON: {e}") })),
    };

    let config = IndexerConfig {
        name: row.name,
        implementation: row.implementation,
        url: settings.url,
        api_key: settings.api_key,
        enabled: true,
        rss_enabled: row.enable_rss,
        search_enabled: row.enable_search,
        categories: vec![],
        priority: row.priority as i32,
        tags: vec![],
    };

    let indexer = match readingroom_providers::from_config(&config) {
        Ok(i) => i,
        Err(e) => return Json(json!({ "success": false, "error": e.to_string() })),
    };

    let supported = if indexer.supports_search() {
        "search"
    } else if indexer.supports_rss() {
        "rss"
    } else {
        "unknown"
    };

    Json(json!({
        "success": true,
        "message": "Indexer connected",
        "supported": supported,
    }))
}

async fn test_download_client(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let row = sqlx::query_as::<_, DownloadClientRow>(
        "SELECT id, name, implementation, settings, enabled, priority, tags, created_at
         FROM download_clients WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let row = match row {
        Ok(Some(r)) => r,
        Ok(None) => return Json(json!({ "success": false, "error": "Download client not found" })),
        Err(e) => return Json(json!({ "success": false, "error": e.to_string() })),
    };

    let settings: DownloadClientSettings = match serde_json::from_str(&row.settings) {
        Ok(s) => s,
        Err(e) => return Json(json!({ "success": false, "error": format!("Invalid settings JSON: {e}") })),
    };

    let config = DownloadClientConfig {
        name: row.name,
        implementation: row.implementation,
        host: settings.host,
        port: settings.port,
        username: settings.username,
        password: settings.password,
        url_base: settings.url_base,
        category: settings.category,
        download_dir: settings.download_dir.map(std::path::PathBuf::from),
        enabled: row.enabled,
        rate_limit: settings.rate_limit,
        concurrent_downloads: settings.concurrent_downloads,
        priority: row.priority as i32,
    };

    let client = match readingroom_downloaders::from_config(&config) {
        Ok(c) => c,
        Err(e) => return Json(json!({ "success": false, "error": e.to_string() })),
    };

    match client.get_config().await {
        Ok(cfg) => Json(json!({
            "success": true,
            "message": "Connected",
            "version": cfg.version,
            "default_save_path": cfg.default_save_path,
        })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/indexers", get(list_indexers).post(create_indexer))
        .route("/indexers/:id", get(get_indexer).put(update_indexer).delete(delete_indexer))
        .route("/indexers/:id/test", post(test_indexer))
        .route("/downloadclients", get(list_download_clients).post(create_download_client))
        .route("/downloadclients/:id", get(get_download_client).put(update_download_client).delete(delete_download_client))
        .route("/downloadclients/:id/test", post(test_download_client))
        .route("/library", get(get_library_settings).put(update_library_settings))
        .route("/integration", get(get_integration_settings))
        .merge(super::metadata_settings::router())
}
