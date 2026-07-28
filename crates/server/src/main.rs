use axum::{
    Router,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::get,
};
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

mod config;
mod api;

#[derive(Clone)]
struct AppState {
    config: readingroom_core::config::Config,
}

#[tokio::main]
async fn main() -> readingroom_core::error::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env()
            .add_directive(tracing::Level::INFO.into()))
        .init();

    let config = config::load()?;
    tracing::info!(host = %config.server.host, port = %config.server.port, "Starting server");

    let state = AppState { config: config.clone() };

    let app = Router::new()
        .route("/health", get(health))
        .nest("/api/v1", api::router())
        .fallback(api::static_handler)
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
