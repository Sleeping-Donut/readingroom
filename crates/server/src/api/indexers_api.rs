use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};

use readingroom_core::config::IndexerConfig;

use crate::AppState;
use crate::api::settings::IndexerRow;

struct ImplInfo {
    implementation: &'static str,
    config_contract: &'static str,
    protocol: &'static str,
    info_link: &'static str,
    supports_rss: bool,
    supports_search: bool,
}

const IMPLEMENTATIONS: [ImplInfo; 3] = [
    ImplInfo {
        implementation: "Torznab",
        config_contract: "TorznabSettings",
        protocol: "torrent",
        info_link: "https://wiki.servarr.com/readarr/supported#torznab",
        supports_rss: true,
        supports_search: true,
    },
    ImplInfo {
        implementation: "Newznab",
        config_contract: "NewznabSettings",
        protocol: "usenet",
        info_link: "https://wiki.servarr.com/readarr/supported#newznab",
        supports_rss: true,
        supports_search: true,
    },
    ImplInfo {
        implementation: "RSS",
        config_contract: "RssSettings",
        protocol: "torrent",
        info_link: "https://wiki.servarr.com/readarr/supported#rss",
        supports_rss: true,
        supports_search: false,
    },
];

fn impl_info(implementation: &str) -> Option<&'static ImplInfo> {
    IMPLEMENTATIONS
        .iter()
        .find(|i| i.implementation.eq_ignore_ascii_case(implementation))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IndexerResource {
    id: Option<i64>,
    name: Option<String>,
    fields: Option<Vec<Value>>,
    implementation: Option<String>,
    enable_rss: Option<bool>,
    enable_automatic_search: Option<bool>,
    enable_interactive_search: Option<bool>,
    priority: Option<i64>,
}

fn field_value<'a>(fields: &'a [Value], name: &str) -> Option<&'a str> {
    fields
        .iter()
        .find(|f| f.get("name").and_then(|v| v.as_str()) == Some(name))
        .and_then(|f| f.get("value").and_then(|v| v.as_str()))
        .filter(|v| !v.is_empty())
}

fn settings_from_fields(fields: &[Value]) -> String {
    let mut settings = json!({});
    if let Some(url) = field_value(fields, "baseUrl") {
        settings["url"] = json!(url);
    }
    if let Some(key) = field_value(fields, "apiKey") {
        settings["api_key"] = json!(key);
    }
    serde_json::to_string(&settings).unwrap_or_else(|_| "{}".into())
}

fn validate_config(config: &IndexerConfig) -> Result<(), String> {
    let indexer = readingroom_providers::from_config(config).map_err(|e| e.to_string())?;
    let supported = if indexer.supports_search() {
        "search"
    } else if indexer.supports_rss() {
        "rss"
    } else {
        "unknown"
    };
    tracing::info!(name = %config.name, supported, "Indexer test passed");
    Ok(())
}

fn field_template(name: &str, label: &str, typ: &str, order: i64, value: Option<Value>) -> Value {
    json!({
        "order": order,
        "name": name,
        "label": label,
        "value": value,
        "type": typ,
        "advanced": false,
        "helpText": "",
        "helpTextWarning": null,
        "helpLink": null,
        "unit": null,
        "placeholder": "",
        "selectOptions": [],
        "selectOptionsProviderAction": null,
        "section": null,
        "hidden": null,
        "isFloat": false,
    })
}

/// Fields Prowlarr reads back and writes unconditionally when syncing indexers.
/// `apiPath`, `categories`, and (for torrents) the seed criteria fields must be
/// present or Prowlarr's ReadarrApp throws a NullReferenceException.
fn indexer_fields(base_url: Option<String>, api_key: Option<String>, is_torrent: bool) -> Vec<Value> {
    let mut fields = vec![
        field_template("baseUrl", "Base URL", "url", 0, base_url.map(Value::String)),
        field_template("apiKey", "API Key", "password", 1, api_key.map(Value::String)),
        field_template("apiPath", "API Path", "text", 2, Some(Value::String("/api".into()))),
        field_template("categories", "Categories", "select", 3, Some(Value::Array(vec![]))),
    ];
    if is_torrent {
        fields.push(field_template("minimumSeeders", "Minimum Seeders", "number", 4, None));
        fields.push(field_template("seedCriteria.seedRatio", "Seed Ratio", "number", 5, None));
        fields.push(field_template("seedCriteria.seedTime", "Seed Time", "number", 6, None));
        fields.push(field_template("seedCriteria.discographySeedTime", "Discography Seed Time", "number", 7, None));
        fields.push(field_template(
            "rejectBlocklistedTorrentHashesWhileGrabbing",
            "Reject Blocklisted Torrent Hashes While Grabbing",
            "checkbox",
            8,
            None,
        ));
    }
    fields
}

fn schema_resource(info: &ImplInfo) -> Value {
    json!({
        "id": 0,
        "name": "",
        "fields": indexer_fields(None, None, info.protocol == "torrent"),
        "implementationName": info.implementation,
        "implementation": info.implementation,
        "configContract": info.config_contract,
        "infoLink": info.info_link,
        "message": null,
        "tags": [],
        "presets": [],
        "enableRss": true,
        "enableAutomaticSearch": true,
        "enableInteractiveSearch": true,
        "supportsRss": info.supports_rss,
        "supportsSearch": info.supports_search,
        "protocol": info.protocol,
        "priority": 1,
        "downloadClientId": 0,
    })
}

fn row_to_resource(row: &IndexerRow) -> Value {
    let settings: Value = serde_json::from_str(&row.settings).unwrap_or_else(|_| json!({}));
    let url = settings.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let api_key = settings.get("api_key").and_then(|v| v.as_str()).unwrap_or("");
    let info = impl_info(&row.implementation);
    let implementation = info.map(|i| i.implementation).unwrap_or("Torznab");
    let (config_contract, protocol, info_link, supports_rss, supports_search) = match info {
        Some(i) => (i.config_contract, i.protocol, i.info_link, i.supports_rss, i.supports_search),
        None => ("TorznabSettings", "torrent", "", true, true),
    };

    json!({
        "id": row.id,
        "name": row.name,
        "fields": indexer_fields(
            (!url.is_empty()).then(|| url.to_string()),
            (!api_key.is_empty()).then(|| api_key.to_string()),
            protocol == "torrent",
        ),
        "implementationName": implementation,
        "implementation": implementation,
        "configContract": config_contract,
        "infoLink": info_link,
        "message": null,
        "tags": [],
        "presets": [],
        "enableRss": row.enable_rss,
        "enableAutomaticSearch": row.enable_search,
        "enableInteractiveSearch": row.enable_search,
        "supportsRss": supports_rss,
        "supportsSearch": supports_search,
        "protocol": protocol,
        "priority": row.priority,
        "downloadClientId": 0,
    })
}

async fn authorize(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<(), (StatusCode, Json<Value>)> {
    if !state.auth_enabled {
        return Ok(());
    }
    if crate::api::auth::current_user(headers, state).await.is_some() {
        return Ok(());
    }
    if let Some(key) = headers.get("X-Api-Key").and_then(|v| v.to_str().ok()) {
        if state.api_key.as_deref() == Some(key) {
            return Ok(());
        }
    }
    Err((
        StatusCode::UNAUTHORIZED,
        Json(json!({ "error": "Authentication required" })),
    ))
}

async fn list_indexers(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    if let Err((status, body)) = authorize(&headers, &state).await {
        return (status, body).into_response();
    }

    match sqlx::query_as::<_, IndexerRow>(
        "SELECT id, name, implementation, settings, enable_rss, enable_search, priority, tags, created_at
         FROM indexers ORDER BY priority, name",
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => Json(Value::Array(rows.iter().map(row_to_resource).collect())).into_response(),
        Err(e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
        }
    }
}

async fn indexer_schema(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    if let Err((status, body)) = authorize(&headers, &state).await {
        return (status, body).into_response();
    }

    let schema = IMPLEMENTATIONS.iter().map(schema_resource).collect::<Vec<_>>();
    Json(Value::Array(schema)).into_response()
}

async fn create_indexer(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Json(body): Json<IndexerResource>,
) -> impl IntoResponse {
    if let Err((status, body)) = authorize(&headers, &state).await {
        return (status, body).into_response();
    }

    let implementation = match body.implementation.as_deref() {
        Some(impl_name) if impl_info(impl_name).is_some() => impl_name.to_lowercase(),
        Some(other) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Unsupported indexer implementation: {other}") })),
            )
                .into_response()
        }
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Missing indexer implementation" })),
            )
                .into_response()
        }
    };

    let name = body.name.unwrap_or_default();
    let fields = body.fields.as_deref().unwrap_or(&[]);
    let url = field_value(fields, "baseUrl").unwrap_or("").to_string();
    let api_key = field_value(fields, "apiKey").map(|s| s.to_string());
    let settings = settings_from_fields(fields);

    let enable_rss = body.enable_rss.unwrap_or(true);
    let enable_search = body.enable_automatic_search.unwrap_or(true)
        || body.enable_interactive_search.unwrap_or(true);
    let priority = body.priority.unwrap_or(0);

    if enable_rss || enable_search {
        let config = IndexerConfig {
            name: name.clone(),
            implementation: implementation.clone(),
            url: url.clone(),
            api_key: api_key.clone(),
            enabled: true,
            rss_enabled: enable_rss,
            search_enabled: enable_search,
            categories: vec![],
            priority: priority as i32,
            tags: vec![],
        };
        if let Err(e) = validate_config(&config) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e })),
            )
                .into_response();
        }
    }

    match sqlx::query(
        "INSERT INTO indexers (name, implementation, settings, enable_rss, enable_search, priority)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(&name)
    .bind(&implementation)
    .bind(&settings)
    .bind(enable_rss)
    .bind(enable_search)
    .bind(priority)
    .execute(&state.db)
    .await
    {
        Ok(r) => {
            let id = r.last_insert_rowid();
            match sqlx::query_as::<_, IndexerRow>(
                "SELECT id, name, implementation, settings, enable_rss, enable_search, priority, tags, created_at
                 FROM indexers WHERE id = ?1",
            )
            .bind(id)
            .fetch_one(&state.db)
            .await
            {
                Ok(row) => Json(row_to_resource(&row)).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e.to_string() })),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn test_indexer(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Json(body): Json<IndexerResource>,
) -> impl IntoResponse {
    if let Err((status, body)) = authorize(&headers, &state).await {
        return (status, body).into_response();
    }

    let implementation = match body.implementation.as_deref() {
        Some(impl_name) if impl_info(impl_name).is_some() => impl_name.to_lowercase(),
        Some(other) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Unsupported indexer implementation: {other}") })),
            )
                .into_response()
        }
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Missing indexer implementation" })),
            )
                .into_response()
        }
    };

    let fields = body.fields.as_deref().unwrap_or(&[]);
    let config = IndexerConfig {
        name: body.name.unwrap_or_default(),
        implementation,
        url: field_value(fields, "baseUrl").unwrap_or("").to_string(),
        api_key: field_value(fields, "apiKey").map(|s| s.to_string()),
        enabled: true,
        rss_enabled: body.enable_rss.unwrap_or(true),
        search_enabled: body.enable_automatic_search.unwrap_or(true)
            || body.enable_interactive_search.unwrap_or(true),
        categories: vec![],
        priority: body.priority.unwrap_or(0) as i32,
        tags: vec![],
    };

    match validate_config(&config) {
        Ok(()) => Json(json!({})).into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e })),
        )
            .into_response(),
    }
}

async fn update_indexer(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(body): Json<IndexerResource>,
) -> impl IntoResponse {
    if let Err((status, body)) = authorize(&headers, &state).await {
        return (status, body).into_response();
    }

    let current = match sqlx::query_as::<_, IndexerRow>(
        "SELECT id, name, implementation, settings, enable_rss, enable_search, priority, tags, created_at
         FROM indexers WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Indexer not found" })),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    };

    let implementation = match &body.implementation {
        Some(impl_name) if impl_info(impl_name).is_some() => impl_name.to_lowercase(),
        Some(other) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Unsupported indexer implementation: {other}") })),
            )
                .into_response()
        }
        None => current.implementation.clone(),
    };

    let name = body.name.unwrap_or(current.name);
    let settings = body
        .fields
        .as_deref()
        .map(settings_from_fields)
        .unwrap_or(current.settings);
    let enable_rss = body.enable_rss.unwrap_or(current.enable_rss);
    let enable_search = match (body.enable_automatic_search, body.enable_interactive_search) {
        (None, None) => current.enable_search,
        (a, i) => a.unwrap_or(false) || i.unwrap_or(false),
    };
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
        Ok(_) => Json(json!({})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn delete_indexer(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    if let Err((status, body)) = authorize(&headers, &state).await {
        return (status, body).into_response();
    }

    match sqlx::query("DELETE FROM indexers WHERE id = ?1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        Ok(_) => Json(json!({})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/", get(list_indexers).post(create_indexer))
        .route("/schema", get(indexer_schema))
        .route("/:id", put(update_indexer).delete(delete_indexer))
        .route("/test", post(test_indexer))
}
