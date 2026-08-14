use std::path::PathBuf;

use argon2::password_hash::{PasswordHasher, SaltString, rand_core::OsRng};
use axum::{Router, http::StatusCode, response::IntoResponse, routing::get};
use clap::Parser;
use std::sync::Arc;
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

    // Create default admin user if auth is enabled and no users exist
    if config.auth.enabled {
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

    // Create metadata source (with caching)
    let metadata: Box<dyn MetadataSource> = Box::new(crate::cache::CachedMetadataSource::new(
        Box::new(readingroom_metadata::openlibrary::OpenLibrarySource::new()),
    ));
    tracing::info!("Metadata source: {}", metadata.name());

    // Initialize indexers from config
    let indexers: Vec<Box<dyn Indexer>> = config
        .indexers
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

    // Initialize download clients from config
    let clients: Vec<Box<dyn DownloadClient>> = config
        .download_clients
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
        config.server.library_root.clone(),
        config.server.audiobook_root.clone(),
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
    download_manager.set_broadcaster(Some(broadcaster.clone()));

    let state = Arc::new(AppState {
        config: config.clone(),
        db: db.clone(),
        metadata,
        search_engine: search_engine.clone(),
        download_manager: download_manager.clone(),
        notification_manager: notification_manager.clone(),
        broadcaster: broadcaster.clone(),
        import_list_manager: import_list_manager.clone(),
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
        app.fallback_service(tower_http::services::fs::ServeDir::new(dir))
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
