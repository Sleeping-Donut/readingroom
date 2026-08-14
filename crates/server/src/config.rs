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

pub fn load(data_dir_override: Option<PathBuf>) -> Result<Config> {
    let path = config_path();
    let mut config = if path.exists() {
        let contents = std::fs::read_to_string(&path)
            .map_err(|e| AppError::Config(format!("Failed to read {}: {e}", path.display())))?;
        toml::from_str(&contents)
            .map_err(|e| AppError::Config(format!("Failed to parse config: {e}")))?
    } else {
        tracing::warn!(path = %path.display(), "Config not found, using defaults");
        Config::default()
    };

    // CLI flag overrides config file and defaults
    if let Some(dir) = data_dir_override {
        config.server.data_dir = dir;
    }

    std::fs::create_dir_all(&config.server.data_dir)?;
    Ok(config)
}
