use async_trait::async_trait;
use readingroom_core::{
    config::DownloadClientConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{ClientConfig, DownloadClient, DownloadId, DownloadItem, DownloadStatus},
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;

pub struct QBittorrentClient {
    name: String,
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
    client: reqwest::Client,
}

#[derive(Deserialize)]
struct TorrentInfo {
    hash: String,
    name: String,
    state: String,
    #[serde(default)]
    total_size: i64,
    #[serde(default)]
    completed: i64,
    #[serde(default)]
    progress: f64,
    #[serde(default)]
    added_on: i64,
    #[serde(default)]
    dlspeed: i64,
    #[serde(default)]
    eta: i64,
}

#[derive(Deserialize)]
struct TorrentProperties {
    save_path: String,
}

impl QBittorrentClient {
    pub fn new(config: &DownloadClientConfig) -> Result<Self> {
        Ok(Self {
            name: config.name.clone(),
            host: config.host.clone(),
            port: config.port,
            username: config.username.clone(),
            password: config.password.clone(),
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1")
                .build()
                .map_err(|e| AppError::Config(format!("HTTP client: {e}")))?,
        })
    }

    fn base_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }

    async fn login(&self) -> Result<String> {
        let url = format!("{}/api/v2/auth/login", self.base_url());
        let resp = self
            .client
            .post(&url)
            .form(&[
                ("username", self.username.as_deref().unwrap_or("")),
                ("password", self.password.as_deref().unwrap_or("")),
            ])
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("qBittorrent connection failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "qBittorrent login failed (HTTP {status}): {text}"
            )));
        }

        let cookie = resp
            .headers()
            .get("set-cookie")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
            .unwrap_or_default();

        if cookie.is_empty() {
            return Err(AppError::Provider(
                "qBittorrent login succeeded but no SID cookie received".into(),
            ));
        }

        Ok(cookie)
    }

    async fn api_get(&self, path: &str) -> Result<reqwest::Response> {
        let sid = self.login().await?;
        let url = format!("{}{}", self.base_url(), path);
        let resp = self
            .client
            .get(&url)
            .header("Cookie", &sid)
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("qBittorrent request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "qBittorrent HTTP {status}: {text}"
            )));
        }

        Ok(resp)
    }

    async fn api_post(&self, path: &str, body: Vec<(&str, &str)>) -> Result<reqwest::Response> {
        let sid = self.login().await?;
        let url = format!("{}{}", self.base_url(), path);
        let resp = self
            .client
            .post(&url)
            .header("Cookie", &sid)
            .form(&body)
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("qBittorrent request failed: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "qBittorrent HTTP {status}: {text}"
            )));
        }

        Ok(resp)
    }

    async fn list_hashes(&self) -> Result<HashSet<String>> {
        let resp = self.api_get("/api/v2/torrents/info").await?;
        let torrents: Vec<TorrentInfo> = resp.json().await.map_err(|e| {
            AppError::Provider(format!("qBittorrent bad JSON: {e}"))
        })?;
        Ok(torrents.into_iter().map(|t| t.hash).collect())
    }

    fn map_state(state: &str, progress: f64) -> DownloadStatus {
        match state {
            "error" | "missingFiles" => DownloadStatus::Failed(state.to_string()),
            "pausedUP" | "pausedDL" | "queuedDL" | "queuedUP" => DownloadStatus::Queued,
            "uploading" | "stalledUP" | "checkingUP" | "forcedUP" => DownloadStatus::Seeding,
            _ if progress >= 1.0 => DownloadStatus::Completed,
            "downloading" | "stalledDL" | "metaDL" | "checkingDL" | "forcedDL" => {
                DownloadStatus::Downloading
            }
            _ => DownloadStatus::Downloading,
        }
    }
}

#[async_trait]
impl DownloadClient for QBittorrentClient {
    fn name(&self) -> &str {
        &self.name
    }

    fn protocol(&self) -> DownloadType {
        DownloadType::Torrent
    }

    async fn add_release(&self, release: &Release) -> Result<DownloadId> {
        let before = self.list_hashes().await?;

        let download_url = match &release.download_type {
            DownloadType::Magnet => release.download_url.clone(),
            _ => release.download_url.clone(),
        };

        self.api_post("/api/v2/torrents/add", vec![("urls", &download_url)])
            .await?;

        let after = self.list_hashes().await?;

        let hash = after
            .difference(&before)
            .next()
            .ok_or_else(|| {
                AppError::Provider(
                    "qBittorrent did not return a new torrent hash".into(),
                )
            })?
            .clone();

        tracing::info!(client = %self.name, hash = %hash, "Torrent added via qBittorrent");
        Ok(DownloadId(hash))
    }

    async fn remove_download(&self, id: &DownloadId) -> Result<()> {
        let path = format!(
            "/api/v2/torrents/delete?hashes={}&deleteFiles=false",
            id.0
        );
        self.api_post(&path, vec![]).await?;
        tracing::info!(client = %self.name, id = %id.0, "Torrent removed from qBittorrent");
        Ok(())
    }

    async fn get_status(&self, id: &DownloadId) -> Result<DownloadStatus> {
        let resp = self
            .api_get(&format!("/api/v2/torrents/info?hashes={}", id.0))
            .await?;
        let torrents: Vec<TorrentInfo> = resp.json().await.map_err(|e| {
            AppError::Provider(format!("qBittorrent bad JSON: {e}"))
        })?;

        match torrents.first() {
            Some(t) => Ok(Self::map_state(&t.state, t.progress)),
            None => Ok(DownloadStatus::Removed),
        }
    }

    async fn list_active(&self) -> Result<Vec<DownloadItem>> {
        let resp = self.api_get("/api/v2/torrents/info").await?;
        let torrents: Vec<TorrentInfo> = resp.json().await.map_err(|e| {
            AppError::Provider(format!("qBittorrent bad JSON: {e}"))
        })?;

        let items = torrents
            .into_iter()
            .map(|t| DownloadItem {
                id: DownloadId(t.hash),
                name: t.name,
                status: Self::map_state(&t.state, t.progress),
                size: t.total_size,
                downloaded_bytes: t.completed,
                progress: t.progress * 100.0,
                added_at: chrono::DateTime::from_timestamp(t.added_on, 0)
                    .unwrap_or_default(),
                estimated_completion: if t.eta > 0 {
                    chrono::DateTime::from_timestamp(
                        chrono::Utc::now().timestamp() + t.eta,
                        0,
                    )
                } else {
                    None
                },
            })
            .collect();

        Ok(items)
    }

    async fn get_config(&self) -> Result<ClientConfig> {
        let version_resp = self.api_get("/api/v2/app/version").await?;
        let version = version_resp.text().await.unwrap_or_default();

        let prefs_resp = self.api_get("/api/v2/app/preferences").await?;
        let prefs: Value = prefs_resp.json().await.map_err(|e| {
            AppError::Provider(format!("qBittorrent bad JSON: {e}"))
        })?;

        let save_path = prefs
            .get("save_path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok(ClientConfig {
            version: Some(version),
            default_save_path: save_path,
            free_space: None,
        })
    }

    async fn get_download_path(&self, id: &DownloadId) -> Result<String> {
        let resp = self
            .api_get(&format!("/api/v2/torrents/properties?hash={}", id.0))
            .await?;
        let props: TorrentProperties = resp.json().await.map_err(|e| {
            AppError::Provider(format!("qBittorrent bad JSON: {e}"))
        })?;

        if props.save_path.is_empty() {
            return Err(AppError::NotFound("Download not found".into()));
        }

        Ok(props.save_path)
    }
}
