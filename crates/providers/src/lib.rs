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
/// plugins by the settings API for the WebUI add/edit flow. Core types declare
/// their config params too, so the WebUI form is data-driven for everything.
pub fn core_implementations() -> Vec<ImplementationInfo> {
    fn param(name: &str, label: &str, ptype: &str, required: bool) -> plugin::ParamDef {
        plugin::ParamDef {
            name: name.into(),
            label: label.into(),
            param_type: ptype.into(),
            required,
            default: None,
            options: vec![],
        }
    }

    vec![
        ImplementationInfo {
            id: "torznab".into(),
            label: "Torznab".into(),
            hint: "Torrent indexer using the Torznab protocol.".into(),
            supports_search: true,
            supports_rss: true,
            params: vec![
                param("url", "URL", "string", true),
                param("api_key", "API Key", "password", false),
            ],
            plugin: false,
        },
        ImplementationInfo {
            id: "newznab".into(),
            label: "Newznab".into(),
            hint: "Usenet indexer using the Newznab protocol.".into(),
            supports_search: true,
            supports_rss: true,
            params: vec![
                param("url", "URL", "string", true),
                param("api_key", "API Key", "password", false),
            ],
            plugin: false,
        },
        ImplementationInfo {
            id: "rss".into(),
            label: "RSS".into(),
            hint: "RSS feed indexer — API key is not required.".into(),
            supports_search: false,
            supports_rss: true,
            params: vec![param("url", "Feed URL", "string", true)],
            plugin: false,
        },
    ]
}
