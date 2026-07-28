use async_trait::async_trait;
use readingroom_core::{
    config::IndexerConfig,
    error::Result,
    models::Release,
    traits::{Indexer, SearchCriteria},
};

pub struct TorznabIndexer {
    name: String,
    url: String,
    api_key: Option<String>,
}

impl TorznabIndexer {
    pub fn new(config: &IndexerConfig) -> Result<Self> {
        Ok(Self {
            name: config.name.clone(),
            url: config.url.trim_end_matches('/').to_string(),
            api_key: config.api_key.clone(),
        })
    }
}

#[async_trait]
impl Indexer for TorznabIndexer {
    fn name(&self) -> &str {
        &self.name
    }

    fn supports_rss(&self) -> bool {
        true
    }

    fn supports_search(&self) -> bool {
        true
    }

    async fn rss_sync(&self) -> Result<Vec<Release>> {
        // TODO: implement Torznab RSS sync
        // Build URL: {url}/api?t=search&cat=...&apikey=...
        // Parse XML response per Torznab spec
        Ok(vec![])
    }

    async fn search(&self, _criteria: &SearchCriteria) -> Result<Vec<Release>> {
        // TODO: implement Torznab search
        Ok(vec![])
    }
}
