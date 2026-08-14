use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    routing,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::AppState;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
struct NotificationRow {
    pub id: i64,
    pub name: String,
    pub implementation: String,
    pub settings: String,
    pub on_grab: bool,
    pub on_import: bool,
    pub on_upgrade: bool,
    pub on_health_issue: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
struct CreateNotificationBody {
    pub name: String,
    pub implementation: String,
    pub settings: Option<String>,
    pub on_grab: Option<bool>,
    pub on_import: Option<bool>,
    pub on_upgrade: Option<bool>,
    pub on_health_issue: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateNotificationBody {
    pub name: Option<String>,
    pub implementation: Option<String>,
    pub settings: Option<String>,
    pub on_grab: Option<bool>,
    pub on_import: Option<bool>,
    pub on_upgrade: Option<bool>,
    pub on_health_issue: Option<bool>,
}

async fn list(State(state): State<Arc<AppState>>) -> Json<Value> {
    let rows = sqlx::query_as::<_, NotificationRow>(
        "SELECT id, name, implementation, settings, on_grab, on_import, on_upgrade, on_health_issue, created_at
         FROM notifications ORDER BY name",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(notifications) => Json(json!({ "notifications": notifications })),
        Err(e) => Json(json!({ "error": e.to_string(), "notifications": [] })),
    }
}

async fn create(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CreateNotificationBody>,
) -> Json<Value> {
    let settings = body.settings.unwrap_or_else(|| "{}".into());
    let result = sqlx::query(
        "INSERT INTO notifications (name, implementation, settings, on_grab, on_import, on_upgrade, on_health_issue)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(&body.name)
    .bind(&body.implementation)
    .bind(&settings)
    .bind(body.on_grab.unwrap_or(true))
    .bind(body.on_import.unwrap_or(true))
    .bind(body.on_upgrade.unwrap_or(true))
    .bind(body.on_health_issue.unwrap_or(true))
    .execute(&state.db)
    .await;

    match result {
        Ok(r) => {
            let id = r.last_insert_rowid();
            let mut mgr = state.notification_manager.lock().await;
            mgr.load_from_db().await;
            Json(json!({ "id": id, "success": true }))
        }
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

async fn get_one(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    let row = sqlx::query_as::<_, NotificationRow>(
        "SELECT id, name, implementation, settings, on_grab, on_import, on_upgrade, on_health_issue, created_at
         FROM notifications WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(notification)) => Json(json!(notification)),
        Ok(None) => Json(json!({ "error": "Notification not found" })),
        Err(e) => Json(json!({ "error": e.to_string() })),
    }
}

async fn update(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateNotificationBody>,
) -> Json<Value> {
    let current = sqlx::query_as::<_, NotificationRow>(
        "SELECT id, name, implementation, settings, on_grab, on_import, on_upgrade, on_health_issue, created_at
         FROM notifications WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let current = match current {
        Ok(Some(c)) => c,
        Ok(None) => return Json(json!({ "error": "Notification not found", "success": false })),
        Err(e) => return Json(json!({ "error": e.to_string(), "success": false })),
    };

    let name = body.name.unwrap_or(current.name);
    let implementation = body.implementation.unwrap_or(current.implementation);
    let settings = body.settings.unwrap_or(current.settings);
    let on_grab = body.on_grab.unwrap_or(current.on_grab);
    let on_import = body.on_import.unwrap_or(current.on_import);
    let on_upgrade = body.on_upgrade.unwrap_or(current.on_upgrade);
    let on_health_issue = body.on_health_issue.unwrap_or(current.on_health_issue);

    match sqlx::query(
        "UPDATE notifications SET name = ?1, implementation = ?2, settings = ?3,
         on_grab = ?4, on_import = ?5, on_upgrade = ?6, on_health_issue = ?7 WHERE id = ?8",
    )
    .bind(&name)
    .bind(&implementation)
    .bind(&settings)
    .bind(on_grab)
    .bind(on_import)
    .bind(on_upgrade)
    .bind(on_health_issue)
    .bind(id)
    .execute(&state.db)
    .await
    {
        Ok(r) => {
            let mut mgr = state.notification_manager.lock().await;
            mgr.load_from_db().await;
            Json(json!({ "rows_affected": r.rows_affected(), "success": true }))
        }
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

async fn remove(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    match sqlx::query("DELETE FROM notifications WHERE id = ?1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        Ok(r) => {
            let mut mgr = state.notification_manager.lock().await;
            mgr.load_from_db().await;
            Json(json!({ "rows_affected": r.rows_affected(), "success": true }))
        }
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

async fn test(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<Value> {
    use readingroom_core::traits::NotificationEvent;
    let mgr = state.notification_manager.lock().await;
    match mgr.send_to(id, &NotificationEvent::Test).await {
        Ok(()) => Json(json!({ "success": true })),
        Err(e) => Json(json!({ "error": e.to_string(), "success": false })),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", routing::get(list).post(create))
        .route("/:id", routing::get(get_one).put(update).delete(remove))
        .route("/:id/test", routing::post(test))
}
