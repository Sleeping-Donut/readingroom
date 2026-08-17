pub mod annas;
pub mod lua;
pub mod newznab;
pub mod plugin;
pub mod rss;
pub mod torznab;

use readingroom_core::error::Result;
use readingroom_core::traits::Indexer;
use readingroom_core::config::IndexerConfig;

pub use plugin::{ImplementationInfo, ParamDef, PluginManager};

/// Build an indexer from its config. Hardcoded protocol indexers are matched
/// first; anything else is looked up as a loaded Lua plugin.
pub fn from_config(config: &IndexerConfig, plugins: &PluginManager) -> Result<Box<dyn Indexer>> {
    match config.implementation.to_lowercase().as_str() {
        "torznab" => Ok(Box::new(torznab::TorznabIndexer::new(config)?)),
        "newznab" => Ok(Box::new(newznab::NewznabIndexer::new(config)?)),
        "rss" => Ok(Box::new(rss::RssIndexer::new(config)?)),
        other => {
            if let Some(result) = plugins.build(config) {
                return result;
            }
            Err(readingroom_core::error::AppError::Config(format!(
                "Unknown indexer implementation: {other}"
            )))
        }
    }
}

/// Static metadata for the hardcoded implementations, merged with loaded
/// plugins by the settings API for the WebUI add/edit flow.
pub fn core_implementations() -> Vec<ImplementationInfo> {
    vec![
        ImplementationInfo {
            id: "torznab".into(),
            label: "Torznab".into(),
            hint: "Torrent indexer using the Torznab protocol.".into(),
            supports_search: true,
            supports_rss: true,
            params: vec![],
            plugin: false,
        },
        ImplementationInfo {
            id: "newznab".into(),
            label: "Newznab".into(),
            hint: "Usenet indexer using the Newznab protocol.".into(),
            supports_search: true,
            supports_rss: true,
            params: vec![],
            plugin: false,
        },
        ImplementationInfo {
            id: "rss".into(),
            label: "RSS".into(),
            hint: "RSS feed indexer — API key is not required.".into(),
            supports_search: false,
            supports_rss: true,
            params: vec![],
            plugin: false,
        },
    ]
}
