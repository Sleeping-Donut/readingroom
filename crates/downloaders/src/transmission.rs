use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use readingroom_core::{
    config::DownloadClientConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{ClientConfig, DownloadClient, DownloadId, DownloadItem, DownloadStatus},
};
use serde::Serialize;
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
    arguments: Option<serde_json::Value>,
    tag: Option<i64>,
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

    async fn rpc_call(&self, method: &str, args: Option<Value>) -> Result<Value> {
        self.rpc_call_with_session(method, &args, None).await
    }

    async fn rpc_call_with_session(
        &self,
        method: &str,
        args: &Option<Value>,
        session_id: Option<&str>,
    ) -> Result<Value> {
        let mut current_sid = session_id.map(|s| s.to_owned());
        // Transmission may return 409 once, requiring a retry with the session header
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
            if let Some(sid) = &current_sid {
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

            let json: Value = resp.json().await.map_err(|e| {
                AppError::Provider(format!("Transmission bad JSON response: {e}"))
            })?;

            if json.get("result").and_then(|r| r.as_str()) != Some("success") {
                let msg = json
                    .get("result")
                    .and_then(|r| r.as_str())
                    .unwrap_or("unknown error");
                return Err(AppError::Provider(format!("Transmission RPC error: {msg}")));
            }

            return Ok(json);
        }

        Err(AppError::Provider(
            "Transmission: too many 409 responses".into(),
        ))
    }

    fn map_torrent_status(code: i64) -> DownloadStatus {
        match code {
            0 => DownloadStatus::Queued,       // TR_STATUS_STOPPED
            1 => DownloadStatus::Queued,        // TR_STATUS_CHECK_WAIT
            2 => DownloadStatus::Downloading,   // TR_STATUS_CHECK
            3 => DownloadStatus::Queued,        // TR_STATUS_DOWNLOAD_WAIT
            4 => DownloadStatus::Downloading,   // TR_STATUS_DOWNLOAD
            5 => DownloadStatus::Queued,        // TR_STATUS_SEED_WAIT
            6 => DownloadStatus::Seeding,       // TR_STATUS_SEED
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

        let resp = self.rpc_call("torrent-add", Some(args)).await?;

        let hash = resp
            .pointer("/arguments/torrent-added/hashString")
            .or_else(|| resp.pointer("/arguments/torrent-duplicate/hashString"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Provider("Transmission did not return torrent hash".into()))?;

        tracing::info!(client = %self.name, hash = %hash, "Torrent added via Transmission");
        Ok(DownloadId(hash.to_string()))
    }

    async fn remove_download(&self, id: &DownloadId) -> Result<()> {
        let args = serde_json::json!({
            "ids": [id.0],
            "delete-local-data": false,
        });

        self.rpc_call("torrent-remove", Some(args)).await?;
        tracing::info!(client = %self.name, id = %id.0, "Torrent removed");
        Ok(())
    }

    async fn get_status(&self, id: &DownloadId) -> Result<DownloadStatus> {
        let args = serde_json::json!({
            "ids": [id.0],
            "fields": ["status", "percentDone", "errorString"],
        });

        let resp = self.rpc_call("torrent-get", Some(args)).await?;
        let torrents = resp
            .pointer("/arguments/torrents")
            .and_then(|v| v.as_array())
            .ok_or_else(|| AppError::Provider("Transmission: missing torrents in response".into()))?;

        match torrents.first() {
            Some(t) => {
                let status = t.get("status").and_then(|s| s.as_i64()).unwrap_or(0);
                let err = t
                    .get("errorString")
                    .and_then(|s| s.as_str())
                    .filter(|s| !s.is_empty());
                match err {
                    Some(msg) => Ok(DownloadStatus::Failed(msg.to_string())),
                    None => Ok(Self::map_torrent_status(status)),
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

        let resp = self.rpc_call("torrent-get", Some(args)).await?;
        let torrents = resp
            .pointer("/arguments/torrents")
            .and_then(|v| v.as_array())
            .ok_or_else(|| AppError::Provider("Transmission: missing torrents".into()))?;

        let items = torrents
            .iter()
            .filter(|t| {
                let status = t.get("status").and_then(|s| s.as_i64()).unwrap_or(0);
                // Only active/paused/checking torrents, not stopped/completed
                status != 0
            })
            .map(|t| {
                let hash = t
                    .get("hashString")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let name = t
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let status_code = t.get("status").and_then(|s| s.as_i64()).unwrap_or(0);
                let total = t.get("totalSize").and_then(|v| v.as_i64()).unwrap_or(0);
                let downloaded = t.get("downloadedEver").and_then(|v| v.as_i64()).unwrap_or(0);
                let pct = t.get("percentDone").and_then(|v| v.as_f64()).unwrap_or(0.0);

                DownloadItem {
                    id: DownloadId(hash),
                    name,
                    status: Self::map_torrent_status(status_code),
                    size: total,
                    downloaded_bytes: downloaded,
                    progress: pct * 100.0,
                    added_at: chrono::DateTime::from_timestamp(
                        t.get("addedDate").and_then(|v| v.as_i64()).unwrap_or(0),
                        0,
                    )
                    .unwrap_or_default(),
                    estimated_completion: None,
                }
            })
            .collect();

        Ok(items)
    }

    async fn get_config(&self) -> Result<ClientConfig> {
        let resp = self.rpc_call("session-get", None).await?;

        Ok(ClientConfig {
            version: resp
                .pointer("/arguments/version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            default_save_path: resp
                .pointer("/arguments/download-dir")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            free_space: None,
        })
    }
}
