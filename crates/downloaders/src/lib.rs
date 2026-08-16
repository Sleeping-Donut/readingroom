pub mod transmission;
pub mod qbittorrent;
pub mod deluge;
pub mod urlutil;

use readingroom_core::error::{AppError, Result};
use readingroom_core::traits::DownloadClient;
use readingroom_core::config::DownloadClientConfig;

/// Build a download client from its config
pub fn from_config(config: &DownloadClientConfig) -> Result<Box<dyn DownloadClient>> {
    match config.implementation.to_lowercase().as_str() {
        "transmission" => Ok(Box::new(transmission::TransmissionClient::new(config)?)),
        "qbittorrent" => Ok(Box::new(qbittorrent::QBittorrentClient::new(config)?)),
        "deluge" => Ok(Box::new(deluge::DelugeClient::new(config)?)),
        other => Err(AppError::Config(format!("Unknown download client: {other}"))),
    }
}
