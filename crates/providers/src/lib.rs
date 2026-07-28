pub mod torznab;
pub mod newznab;
pub mod rss;

use readingroom_core::error::Result;
use readingroom_core::traits::Indexer;
use readingroom_core::config::IndexerConfig;

/// Build an indexer from its config
pub fn from_config(config: &IndexerConfig) -> Result<Box<dyn Indexer>> {
    match config.implementation.to_lowercase().as_str() {
        "torznab" => Ok(Box::new(torznab::TorznabIndexer::new(config)?)),
        "newznab" => Ok(Box::new(newznab::NewznabIndexer::new(config)?)),
        "rss" => Ok(Box::new(rss::RssIndexer::new(config)?)),
        other => Err(readingroom_core::error::AppError::Config(
            format!("Unknown indexer implementation: {other}"),
        )),
    }
}
