use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use readingroom_core::{
    config::DownloadClientConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{ClientConfig, DownloadClient, DownloadId, DownloadItem, DownloadStatus},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct TransmissionClient {
    name: String,
    rpc_url: String,
    auth_header: Option<String>,
    client: reqwest::Client,
}

#[derive(Serialize)]
struct RpcRequest {
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    arguments: Option<Value>,
    tag: Option<i64>,
}

#[derive(Deserialize)]
struct RpcResponse {
    result: String,
    arguments: Option<Value>,
}

#[derive(Deserialize)]
struct TorrentGetResponse {
    torrents: Vec<TorrentInfo>,
}

#[derive(Deserialize)]
struct TorrentInfo {
    #[serde(alias = "hashString")]
    hash_string: String,
    name: String,
    status: i64,
    #[serde(default)]
    total_size: i64,
    #[serde(default)]
    downloaded_ever: i64,
    #[serde(default)]
    percent_done: f64,
    #[serde(default)]
    added_date: i64,
    #[serde(default)]
    error_string: String,
    #[serde(default)]
    download_dir: Option<String>,
}

#[derive(Deserialize)]
struct TorrentAddedResponse {
    #[serde(default)]
    torrent_added: Option<TorrentAddedInfo>,
    #[serde(default)]
    torrent_duplicate: Option<TorrentAddedInfo>,
}

#[derive(Deserialize)]
struct TorrentAddedInfo {
    #[serde(alias = "hashString")]
    hash_string: String,
}

#[derive(Deserialize)]
struct SessionGetResponse {
    version: Option<String>,
    #[serde(alias = "download-dir")]
    download_dir: Option<String>,
}

impl TransmissionClient {
    pub fn new(config: &DownloadClientConfig) -> Result<Self> {
        let scheme = if config.port == 9091 || config.port == 443 {
            "https"
        } else {
            "http"
        };
        let rpc_url = format!(
            "{}://{}:{}{}/transmission/rpc",
            scheme,
            config.host,
            config.port,
            config.url_base.as_deref().unwrap_or(""),
        );

        let auth_header = match (&config.username, &config.password) {
            (Some(u), Some(p)) => {
                let creds = BASE64.encode(format!("{u}:{p}"));
                Some(format!("Basic {creds}"))
            }
            _ => None,
        };

        Ok(Self {
            name: config.name.clone(),
            rpc_url,
            auth_header,
            client: reqwest::Client::new(),
        })
    }

    async fn rpc_call_raw(&self, method: &str, args: Option<Value>) -> Result<RpcResponse> {
        let mut current_sid: Option<String> = None;
        for _ in 0..2 {
            let body = RpcRequest {
                method: method.into(),
                arguments: args.clone(),
                tag: None,
            };

            let mut req = self.client.post(&self.rpc_url).json(&body);

            if let Some(auth) = &self.auth_header {
                req = req.header("Authorization", auth);
            }
            if let Some(ref sid) = current_sid {
                req = req.header("X-Transmission-Session-Id", sid);
            }

            let resp = req.send().await.map_err(|e| {
                AppError::Provider(format!("Transmission connection failed: {e}"))
            })?;

            let status = resp.status();

            if status == 409 {
                current_sid = resp
                    .headers()
                    .get("X-Transmission-Session-Id")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_owned());
                continue;
            }

            if !status.is_success() {
                return Err(AppError::Provider(format!(
                    "Transmission returned HTTP {status}"
                )));
            }

            let rpc: RpcResponse = resp.json().await.map_err(|e| {
                AppError::Provider(format!("Transmission bad JSON response: {e}"))
            })?;

            if rpc.result != "success" {
                return Err(AppError::Provider(format!(
                    "Transmission RPC error: {}",
                    rpc.result
                )));
            }

            return Ok(rpc);
        }

        Err(AppError::Provider(
            "Transmission: too many 409 responses".into(),
        ))
    }

    fn map_torrent_status(code: i64) -> DownloadStatus {
        match code {
            0 => DownloadStatus::Queued,
            1 => DownloadStatus::Queued,
            2 => DownloadStatus::Downloading,
            3 => DownloadStatus::Queued,
            4 => DownloadStatus::Downloading,
            5 => DownloadStatus::Queued,
            6 => DownloadStatus::Seeding,
            _ => DownloadStatus::Downloading,
        }
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
        let filename = match &release.download_type {
            DownloadType::Magnet => release.download_url.clone(),
            _ => release.download_url.clone(),
        };

        let args = serde_json::json!({
            "filename": filename,
            "paused": false,
        });

        let resp = self.rpc_call_raw("torrent-add", Some(args)).await?;
        let args_val = resp
            .arguments
            .ok_or_else(|| AppError::Provider("Transmission: no arguments".into()))?;

        let add: TorrentAddedResponse =
            serde_json::from_value(args_val)
                .map_err(|e| {
                    AppError::Provider(format!("Transmission: bad add response: {e}"))
                })?;

        let hash = add
            .torrent_added
            .or(add.torrent_duplicate)
            .ok_or_else(|| {
                AppError::Provider("Transmission did not return torrent hash".into())
            })?;

        tracing::info!(client = %self.name, hash = %hash.hash_string, "Torrent added via Transmission");
        Ok(DownloadId(hash.hash_string))
    }

    async fn remove_download(&self, id: &DownloadId) -> Result<()> {
        let args = serde_json::json!({
            "ids": [id.0],
            "delete-local-data": false,
        });

        self.rpc_call_raw("torrent-remove", Some(args)).await?;
        tracing::info!(client = %self.name, id = %id.0, "Torrent removed");
        Ok(())
    }

    async fn get_status(&self, id: &DownloadId) -> Result<DownloadStatus> {
        let args = serde_json::json!({
            "ids": [id.0],
            "fields": ["status", "percentDone", "errorString"],
        });

        let resp = self.rpc_call_raw("torrent-get", Some(args)).await?;
        let args_val = resp
            .arguments
            .ok_or_else(|| AppError::Provider("Transmission: no arguments".into()))?;

        let get: TorrentGetResponse = serde_json::from_value(args_val).map_err(|e| {
            AppError::Provider(format!("Transmission: bad get response: {e}"))
        })?;

        match get.torrents.first() {
            Some(t) => {
                if !t.error_string.is_empty() {
                    Ok(DownloadStatus::Failed(t.error_string.clone()))
                } else {
                    Ok(Self::map_torrent_status(t.status))
                }
            }
            None => Ok(DownloadStatus::Removed),
        }
    }

    async fn list_active(&self) -> Result<Vec<DownloadItem>> {
        let args = serde_json::json!({
            "fields": [
                "id", "name", "hashString", "status", "totalSize",
                "downloadedEver", "percentDone", "addedDate",
                "errorString", "rateDownload", "eta"
            ],
        });

        let resp = self.rpc_call_raw("torrent-get", Some(args)).await?;
        let args_val = resp
            .arguments
            .ok_or_else(|| AppError::Provider("Transmission: no arguments".into()))?;

        let get: TorrentGetResponse = serde_json::from_value(args_val).map_err(|e| {
            AppError::Provider(format!("Transmission: bad get response: {e}"))
        })?;

        let items = get
            .torrents
            .into_iter()
            .filter(|t| t.status != 0)
            .map(|t| DownloadItem {
                id: DownloadId(t.hash_string),
                name: t.name,
                status: Self::map_torrent_status(t.status),
                size: t.total_size,
                downloaded_bytes: t.downloaded_ever,
                progress: t.percent_done * 100.0,
                added_at: chrono::DateTime::from_timestamp(t.added_date, 0)
                    .unwrap_or_default(),
                estimated_completion: None,
            })
            .collect();

        Ok(items)
    }

    async fn get_download_path(&self, id: &DownloadId) -> Result<String> {
        let args = serde_json::json!({
            "ids": [id.0],
            "fields": ["name", "downloadDir"],
        });

        let resp = self.rpc_call_raw("torrent-get", Some(args)).await?;
        let args_val = resp
            .arguments
            .ok_or_else(|| AppError::Provider("Transmission: no arguments".into()))?;

        let get: TorrentGetResponse = serde_json::from_value(args_val).map_err(|e| {
            AppError::Provider(format!("Transmission: bad get response: {e}"))
        })?;

        match get.torrents.first() {
            Some(t) => {
                let dir = t.download_dir.as_deref().unwrap_or("");
                if dir.is_empty() || t.hash_string.is_empty() {
                    return Err(AppError::NotFound("Download not found".into()));
                }
                Ok(format!("{}/{}", dir, t.name))
            }
            None => Err(AppError::NotFound("Download not found".into())),
        }
    }

    async fn get_config(&self) -> Result<ClientConfig> {
        let resp = self.rpc_call_raw("session-get", None).await?;
        let args_val = resp
            .arguments
            .ok_or_else(|| AppError::Provider("Transmission: no arguments".into()))?;

        let session: SessionGetResponse = serde_json::from_value(args_val).map_err(|e| {
            AppError::Provider(format!("Transmission: bad session response: {e}"))
        })?;

        Ok(ClientConfig {
            version: session.version,
            default_save_path: session.download_dir,
            free_space: None,
        })
    }
}
