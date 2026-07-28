use async_trait::async_trait;
use readingroom_core::{
    config::IndexerConfig,
    error::Result,
    models::Release,
    traits::{Indexer, SearchCriteria},
};

pub struct NewznabIndexer {
    name: String,
    url: String,
}

impl NewznabIndexer {
    pub fn new(config: &IndexerConfig) -> Result<Self> {
        Ok(Self {
            name: config.name.clone(),
            url: config.url.trim_end_matches('/').to_string(),
        })
    }
}

#[async_trait]
impl Indexer for NewznabIndexer {
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
        Ok(vec![])
    }
    async fn search(&self, _criteria: &SearchCriteria) -> Result<Vec<Release>> {
        Ok(vec![])
    }
}
