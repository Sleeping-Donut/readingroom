use async_trait::async_trait;
use readingroom_core::{
    config::DownloadClientConfig,
    error::Result,
    models::{DownloadType, Release},
    traits::{ClientConfig, DownloadClient, DownloadId, DownloadItem, DownloadStatus},
};

pub struct TransmissionClient {
    name: String,
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
}

impl TransmissionClient {
    pub fn new(config: &DownloadClientConfig) -> Result<Self> {
        Ok(Self {
            name: config.name.clone(),
            host: config.host.clone(),
            port: config.port,
            username: config.username.clone(),
            password: config.password.clone(),
        })
    }
}

#[async_trait]
impl DownloadClient for TransmissionClient {
    fn name(&self) -> &str {
        &self.name
    }

    fn protocol(&self) -> DownloadType {
        DownloadType::Torrent
    }

    async fn add_release(&self, release: &Release) -> Result<DownloadId> {
        // POST /transmission/rpc with "torrent-add" method
        // body: { "method": "torrent-add", "arguments": { "filename": "<magnet or url>" } }
        tracing::info!(name=%self.name, release=%release.title, "Adding torrent");
        Ok(DownloadId("placeholder".into()))
    }

    async fn remove_download(&self, id: &DownloadId) -> Result<()> {
        tracing::info!(name=%self.name, id=%id.0, "Removing download");
        Ok(())
    }

    async fn get_status(&self, _id: &DownloadId) -> Result<DownloadStatus> {
        Ok(DownloadStatus::Downloading)
    }

    async fn list_active(&self) -> Result<Vec<DownloadItem>> {
        // GET /transmission/rpc with "torrent-get" method
        Ok(vec![])
    }

    async fn get_config(&self) -> Result<ClientConfig> {
        // GET /transmission/rpc with "session-get" method
        Ok(ClientConfig {
            version: None,
            default_save_path: None,
            free_space: None,
        })
    }
}
