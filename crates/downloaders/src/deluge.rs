use async_trait::async_trait;
use readingroom_core::{
    config::DownloadClientConfig,
    error::Result,
    models::{DownloadType, Release},
    traits::{ClientConfig, DownloadClient, DownloadId, DownloadItem, DownloadStatus},
};

pub struct DelugeClient {
    name: String,
    host: String,
    port: u16,
}

impl DelugeClient {
    pub fn new(config: &DownloadClientConfig) -> Result<Self> {
        Ok(Self {
            name: config.name.clone(),
            host: config.host.clone(),
            port: config.port,
        })
    }
}

#[async_trait]
impl DownloadClient for DelugeClient {
    fn name(&self) -> &str {
        &self.name
    }
    fn protocol(&self) -> DownloadType {
        DownloadType::Torrent
    }
    async fn add_release(&self, _release: &Release) -> Result<DownloadId> {
        Ok(DownloadId("placeholder".into()))
    }
    async fn remove_download(&self, _id: &DownloadId) -> Result<()> {
        Ok(())
    }
    async fn get_status(&self, _id: &DownloadId) -> Result<DownloadStatus> {
        Ok(DownloadStatus::Downloading)
    }
    async fn list_active(&self) -> Result<Vec<DownloadItem>> {
        Ok(vec![])
    }
    async fn get_config(&self) -> Result<ClientConfig> {
        Ok(ClientConfig {
            version: None,
            default_save_path: None,
            free_space: None,
        })
    }
}
