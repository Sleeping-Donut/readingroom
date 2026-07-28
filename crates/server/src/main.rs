use axum::{Router, http::StatusCode, response::IntoResponse, routing::get};
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

use readingroom_core::traits::MetadataSource;

mod api;
mod config;

pub struct AppState {
    pub config: readingroom_core::config::Config,
    pub db: sqlx::SqlitePool,
    pub metadata: Box<dyn readingroom_core::traits::MetadataSource>,
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

    let config = config::load()?;
    tracing::info!(?config.server, "Configuration loaded");

    // Initialize database
    let db_path = config.server.data_dir.join("readingroom.db");
    let database_url = format!("sqlite:{}", db_path.display());
    let db = readingroom_db::connect(&database_url).await?;
    tracing::info!("Database connected");

    // Create metadata source
    let metadata = readingroom_metadata::openlibrary::OpenLibrarySource::new();
    tracing::info!("Metadata source: {}", metadata.name());

    let state = Arc::new(AppState {
        config: config.clone(),
        db,
        metadata: Box::new(metadata),
    });

    let app = Router::<Arc<AppState>>::new()
        .route("/health", get(health))
        .nest("/api/v1", api::router())
        .with_state(state);

    let addr = format!("{}:{}", config.server.host, config.server.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    tracing::info!("Listening on http://{}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}
