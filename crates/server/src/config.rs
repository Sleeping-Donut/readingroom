use std::path::PathBuf;

use readingroom_core::config::Config;
use readingroom_core::error::{AppError, Result};

fn config_path() -> PathBuf {
    let config_dir = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
            PathBuf::from(home).join(".config")
        });
    config_dir.join("readingroom").join("config.toml")
}

pub fn load() -> Result<Config> {
    let path = config_path();

    if !path.exists() {
        tracing::warn!(%path, "Config not found, using defaults");
        let config = Config::default();
        // Ensure data dir exists
        std::fs::create_dir_all(&config.server.data_dir)?;
        return Ok(config);
    }

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Config(format!("Failed to read {path}: {e}")))?;

    let config: Config = toml::from_str(&contents)
        .map_err(|e| AppError::Config(format!("Failed to parse config: {e}")))?;

    std::fs::create_dir_all(&config.server.data_dir)?;

    Ok(config)
}
