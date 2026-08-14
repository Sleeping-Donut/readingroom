use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{delete, get, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateImportListBody {
    pub name: String,
    pub implementation: String,
    pub settings: Option<String>,
    pub enabled: Option<bool>,
    pub root_folder: Option<String>,
    pub monitor: Option<bool>,
    pub quality_profile: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateImportListBody {
    pub name: Option<String>,
    pub implementation: Option<String>,
    pub settings: Option<String>,
    pub enabled: Option<bool>,
    pub root_folder: Option<String>,
    pub monitor: Option<bool>,
    pub quality_profile: Option<String>,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ImportListApiRow {
    pub id: i64,
    pub name: String,
    pub implementation: String,
    pub settings: String,
    pub enabled: bool,
    pub root_folder: Option<String>,
    pub monitor: bool,
    pub quality_profile: Option<String>,
    pub created_at: String,
}

async fn list_import_lists(State(state): State<Arc<AppState>>) -> Json<Value> {
    let rows = sqlx::query_as::<_, ImportListApiRow>(
        "SELECT id, name, implementation, settings, enabled, root_folder, monitor, quality_profile, created_at
         FROM import_lists ORDER BY name",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(lists) => Json(json!({ "import_lists": lists })),
        Err(e) => Json(json!({ "error": e.to_string(), "import_lists": [] })),
    }
}

async fn create_import_list(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateImportListBody>,
) -> Json<Value> {
    let result = sqlx::query(
        "INSERT INTO import_lists (name, implementation, settings, enabled, root_folder, monitor, quality_profile)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(&body.name)
    .bind(&body.implementation)
    .bind(body.settings.as_deref().unwrap_or("{}"))
    .bind(body.enabled.unwrap_or(true))
    .bind(&body.root_folder)
    .bind(body.monitor.unwrap_or(true))
    .bind(&body.quality_profile)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) => Json(json!({ "id": r.last_insert_rowid(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

async fn get_import_list(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let row = sqlx::query_as::<_, ImportListApiRow>(
        "SELECT id, name, implementation, settings, enabled, root_folder, monitor, quality_profile, created_at
         FROM import_lists WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(list)) => Json(json!(list)),
        Ok(None) => Json(json!({ "error": "Import list not found" })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn update_import_list(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateImportListBody>,
) -> Json<Value> {
    let current = sqlx::query_as::<_, ImportListApiRow>(
        "SELECT id, name, implementation, settings, enabled, root_folder, monitor, quality_profile, created_at
         FROM import_lists WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let current = match current {
        Ok(Some(c)) => c,
        Ok(None) => return Json(json!({ "error": "Import list not found", "success": false })),
        Err(e) => return Json(json!({ "error": e.to_string(), "success": false })),
    };

    let name = body.name.unwrap_or(current.name);
    let implementation = body.implementation.unwrap_or(current.implementation);
    let settings = body.settings.unwrap_or(current.settings);
    let enabled = body.enabled.unwrap_or(current.enabled);
    let root_folder = body.root_folder.or(current.root_folder);
    let monitor = body.monitor.unwrap_or(current.monitor);
    let quality_profile = body.quality_profile.or(current.quality_profile);

    match sqlx::query(
        "UPDATE import_lists SET name = ?1, implementation = ?2, settings = ?3,
         enabled = ?4, root_folder = ?5, monitor = ?6, quality_profile = ?7 WHERE id = ?8",
    )
    .bind(&name)
    .bind(&implementation)
    .bind(&settings)
    .bind(enabled)
    .bind(&root_folder)
    .bind(monitor)
    .bind(&quality_profile)
    .bind(id)
    .execute(&state.db)
    .await
    {
        Ok(r) => Json(json!({ "rows_affected": r.rows_affected(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

async fn delete_import_list(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match sqlx::query("DELETE FROM import_lists WHERE id = ?1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        Ok(r) => Json(json!({ "rows_affected": r.rows_affected(), "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

async fn sync_import_list(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match state.import_list_manager.sync_list(id).await {
        Ok(_) => Json(json!({ "success": true, "message": "Import list synced" })),
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/", get(list_import_lists).post(create_import_list))
        .route("/:id", get(get_import_list).put(update_import_list).delete(delete_import_list))
        .route("/:id/sync", post(sync_import_list))
}
