use std::path::PathBuf;

use argon2::password_hash::{PasswordHasher, SaltString, rand_core::OsRng};
use argon2::password_hash::rand_core::RngCore;
use axum::{Router, http::StatusCode, response::IntoResponse, routing::get};
use clap::Parser;
use std::os::unix::fs::OpenOptionsExt;
use std::sync::Arc;
use tower::ServiceExt;
use tracing_subscriber::EnvFilter;

use readingroom_core::traits::{DownloadClient, Indexer, MetadataSource};

mod api;
mod config;
mod db;
mod downloads;
mod search;

mod bulk_import;
mod cache;
mod calibre;
mod converter;
mod import;
mod import_list;
mod notifications;
mod scheduler;
mod ws;

#[derive(Parser)]
#[command(name = "readingroom-server", version, about = "ReadingRoom media server")]
struct Args {
    /// Override the data directory (default: XDG_DATA_HOME/readingroom)
    #[arg(short = 'd', long = "data-dir", env = "READINGROOM_DATA_DIR")]
    data_dir: Option<PathBuf>,

    /// Override the listen port (default: from config or 5299)
    #[arg(short = 'p', long = "port", env = "READINGROOM_PORT")]
    port: Option<u16>,

    /// Override the listen host (default: from config or 127.0.0.1)
    #[arg(short = 'H', long = "host", env = "READINGROOM_HOST")]
    host: Option<String>,
}

pub struct AppState {
    pub config: readingroom_core::config::Config,
    pub db: sqlx::SqlitePool,
    pub metadata: Box<dyn MetadataSource>,
    pub search_engine: Arc<crate::search::SearchEngine>,
    pub download_manager: Arc<crate::downloads::DownloadManager>,
    pub notification_manager: Arc<tokio::sync::Mutex<crate::notifications::NotificationManager>>,
    pub broadcaster: ws::WsBroadcaster,
    pub import_list_manager: Arc<crate::import_list::ImportListManager>,
    pub auth_enabled: bool,
    pub jwt_secret: String,
    pub api_key: Option<String>,
}

#[tokio::main]
async fn main() -> readingroom_core::error::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("readingroom=debug".parse().unwrap())
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    let args = Args::parse();
    let mut config = config::load(args.data_dir)?;
    if let Some(port) = args.port {
        config.server.port = port;
    }
    if let Some(host) = args.host {
        config.server.host = host;
    }
    tracing::info!(?config.server, "Configuration loaded");

    // Initialize database
    let db_path = config.server.data_dir.join("readingroom.db");
    let db = readingroom_db::connect(&db_path).await?;
    tracing::info!("Database connected");

    // Apply any runtime "library" settings from the DB config table over
    // config.toml so imports and the settings API use the merged values.
    if let Ok(Some(lib_json)) = crate::db::get_config_value(&db, "library").await {
        if let Ok(overlay) = serde_json::from_str::<readingroom_core::config::LibraryConfig>(&lib_json) {
            config.library.merge_library(&overlay);
            tracing::info!("Applied runtime library settings from DB config");
        }
    }

    // Auth is env-driven (credentials live in the users table, not config).
    let auth_enabled = std::env::var("READINGROOM_AUTH_ENABLED")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    // JWT secret: READINGROOM_JWT_SECRET overrides; otherwise auto-generate a
    // random one on first start and persist it in the data dir so tokens
    // survive restarts without needing an env var.
    let jwt_secret = match std::env::var("READINGROOM_JWT_SECRET") {
        Ok(secret) if !secret.is_empty() => secret,
        _ => {
            let secret_path = config.server.data_dir.join("jwt_secret");
            if let Ok(stored) = std::fs::read_to_string(&secret_path) {
                stored.trim().to_string()
            } else {
                let mut bytes = [0u8; 32];
                OsRng.fill_bytes(&mut bytes);
                let secret = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
                let mut file = std::fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(true)
                    .mode(0o600)
                    .open(&secret_path)
                    .expect("failed to create JWT secret file");
                use std::io::Write;
                file.write_all(secret.as_bytes())
                    .expect("failed to write JWT secret");
                tracing::info!("Generated JWT secret at {}", secret_path.display());
                secret
            }
        }
    };

    // Create default admin user if auth is enabled and no users exist
    if auth_enabled {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&db)
            .await?;
        if count.0 == 0 {
            let salt = argon2::password_hash::SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
            let hash = argon2::Argon2::default()
                .hash_password(b"admin", &salt)
                .map(|h| h.to_string())
                .unwrap_or_else(|_| "$argon2id$v=19$m=19456,t=2,p=1$default".into());
            sqlx::query("INSERT INTO users (username, password, role) VALUES ('admin', ?1, 'admin')")
                .bind(&hash)
                .execute(&db)
                .await?;
            tracing::warn!("Default admin user created (username: admin, password: admin) — CHANGE IMMEDIATELY");
        }
    }

    // API key for arr-compatible clients (Prowlarr app-sync via X-Api-Key).
    let api_key = std::env::var("READINGROOM_API_KEY")
        .ok()
        .filter(|k| !k.is_empty());

    // Create metadata source (with caching)
    let metadata: Box<dyn MetadataSource> = Box::new(crate::cache::CachedMetadataSource::new(
        Box::new(readingroom_metadata::openlibrary::OpenLibrarySource::new()),
    ));
    tracing::info!("Metadata source: {}", metadata.name());

    // Initialize indexers: DB-managed (settings API / Prowlarr) first, then config.toml.
    let mut indexer_configs: Vec<readingroom_core::config::IndexerConfig> =
        crate::db::list_indexer_configs(&db).await.unwrap_or_default();
    for c in &config.indexers {
        if !indexer_configs.iter().any(|existing| existing.name == c.name) {
            indexer_configs.push(c.clone());
        }
    }
    let indexers: Vec<Box<dyn Indexer>> = indexer_configs
        .iter()
        .filter(|c| c.enabled)
        .filter_map(|c| {
            readingroom_providers::from_config(c)
                .map_err(|e| {
                    tracing::warn!(name = %c.name, error = %e, "Failed to initialize indexer");
                    e
                })
                .ok()
        })
        .collect();
    tracing::info!(count = %indexers.len(), "Indexers initialized");

    // Initialize download clients: DB-configured clients (Settings UI) take
    // precedence, then config.toml clients, de-duplicated by name.
    let mut client_configs: Vec<readingroom_core::config::DownloadClientConfig> = Vec::new();
    match crate::db::list_download_client_configs(&db).await {
        Ok(db_configs) => {
            client_configs.extend(db_configs);
            tracing::info!(count = %client_configs.len(), "Download clients loaded from DB");
        }
        Err(e) => tracing::warn!(error = %e, "Failed to load download clients from DB"),
    }
    for c in &config.download_clients {
        if !client_configs.iter().any(|existing| existing.name == c.name) {
            client_configs.push(c.clone());
        }
    }

    // The direct HTTP downloader is built-in: always ensure at least one
    // client exists so releases can be downloaded even with nothing configured.
    if !client_configs.iter().any(|c| c.name == "HTTP Direct") {
        client_configs.push(readingroom_core::config::DownloadClientConfig {
            name: "HTTP Direct".into(),
            implementation: "http".into(),
            host: String::new(),
            port: 0,
            username: None,
            password: None,
            url_base: None,
            category: None,
            download_dir: Some(config.server.data_dir.join("downloads")),
            enabled: true,
            rate_limit: None,
            concurrent_downloads: None,
            priority: 0,
        });
        tracing::info!("Added built-in HTTP Direct download client");
    }

    let clients: Vec<Box<dyn DownloadClient>> = client_configs
        .iter()
        .filter(|c| c.enabled)
        .filter_map(|c| {
            readingroom_downloaders::from_config(c)
                .map_err(|e| {
                    tracing::warn!(name = %c.name, error = %e, "Failed to initialize download client");
                    e
                })
                .ok()
        })
        .collect();
    tracing::info!(count = %clients.len(), "Download clients initialized");

    // Create import manager
    let import_manager = Arc::new(crate::import::ImportManager::new(
        db.clone(),
        config.library.clone(),
    ));
    tracing::info!("Import manager initialized");

    // Create import list manager (with caching)
    let import_list_manager = Arc::new(crate::import_list::ImportListManager::new(
        db.clone(),
        Box::new(crate::cache::CachedMetadataSource::new(
            Box::new(readingroom_metadata::openlibrary::OpenLibrarySource::new()),
        )),
    ));
    tracing::info!("Import list manager initialized");

    // Initialize notification manager (before download manager, which needs it)
    let notification_manager = Arc::new(tokio::sync::Mutex::new(crate::notifications::NotificationManager::new(db.clone())));
    notification_manager.lock().await.load_from_db().await;

    let download_manager = Arc::new(crate::downloads::DownloadManager::new(
        clients,
        db.clone(),
        Some(import_manager),
        notification_manager.clone(),
    ));

    // Create search engine (shared between scheduler and state)
    let search_engine = Arc::new(crate::search::SearchEngine::new(indexers, db.clone()));

    // Create WebSocket broadcaster
    let broadcaster = ws::new_broadcaster();
    tracing::info!("WebSocket broadcaster initialized");

    // Wire broadcaster into DownloadManager for real-time events
    download_manager.set_broadcaster(Some(broadcaster.clone())).await;

    let state = Arc::new(AppState {
        config: config.clone(),
        db: db.clone(),
        metadata,
        search_engine: search_engine.clone(),
        download_manager: download_manager.clone(),
        notification_manager: notification_manager.clone(),
        broadcaster: broadcaster.clone(),
        import_list_manager: import_list_manager.clone(),
        auth_enabled,
        jwt_secret,
        api_key,
    });

    // Start background scheduler
    let scheduler = crate::scheduler::Scheduler::new(
        db.clone(),
        download_manager.clone(),
        search_engine.clone(),
        import_list_manager.clone(),
    );
    scheduler.start().await?;

    // Try to serve frontend static files
    let frontend_paths = [
        std::env::var("FRONTEND_DIST").unwrap_or_default(),
        "frontend/dist".to_string(),
        "../frontend/dist".to_string(),
        config.server.data_dir.join("frontend").to_string_lossy().to_string(),
    ];
    let mut frontend_dir = None;
    for p in &frontend_paths {
        if !p.is_empty() && std::path::Path::new(p).exists() {
            frontend_dir = Some(p.clone());
            break;
        }
    }

    let app = Router::<Arc<AppState>>::new()
        .route("/health", get(health))
        .route("/ws", get(crate::ws::ws_handler))
        .nest("/api/v1", api::router(state.clone()));

    let app = if let Some(dir) = frontend_dir {
        tracing::info!(path = %dir, "Serving frontend from");
        // SPA fallback: serve real files via ServeDir, and return index.html
        // (status 200) for client-side routes (e.g. /authors) so refreshes
        // don't 404. Unknown /api/v1/* paths are caught by the API router's
        // own JSON fallback first, so they never reach here.
        let dir_path = std::path::PathBuf::from(&dir);
        let index_html: std::sync::Arc<Vec<u8>> = std::sync::Arc::new(
            std::fs::read(dir_path.join("index.html")).unwrap_or_default(),
        );
        let spa = move |req: axum::extract::Request| {
            let mut serve_dir = tower_http::services::fs::ServeDir::new(dir_path.clone());
            let index_html = index_html.clone();
            async move {
                let res = serve_dir.oneshot(req).await.unwrap();
                if res.status() == axum::http::StatusCode::NOT_FOUND {
                    axum::response::Response::builder()
                        .status(axum::http::StatusCode::OK)
                        .header(axum::http::header::CONTENT_TYPE, "text/html")
                        .body(axum::body::Body::from(index_html.as_ref().clone()))
                        .unwrap()
                } else {
                    res.map(axum::body::Body::new)
                }
            }
        };
        app.fallback(spa)
    } else {
        tracing::warn!("No frontend dist found, API only");
        app
    };

    let app = app.with_state(state);

    let addr = format!("{}:{}", config.server.host, config.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    tracing::info!("Listening on http://{}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}
