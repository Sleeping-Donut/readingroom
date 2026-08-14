use async_trait::async_trait;
use readingroom_core::{
    config::DownloadClientConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{ClientConfig, DownloadClient, DownloadId, DownloadItem, DownloadStatus},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;

pub struct DelugeClient {
    name: String,
    host: String,
    port: u16,
    password: Option<String>,
    client: reqwest::Client,
}

#[derive(Serialize)]
struct RpcRequest {
    method: String,
    params: Vec<Value>,
    id: u64,
}

#[derive(Deserialize)]
struct RpcResponse {
    result: Option<Value>,
    error: Option<RpcErrorValue>,
    id: u64,
}

#[derive(Deserialize)]
struct RpcErrorValue {
    message: String,
    code: i64,
}

#[derive(Deserialize)]
struct TorrentStatusFields {
    #[serde(default)]
    state: String,
    #[serde(default)]
    progress: f64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    total_size: i64,
    #[serde(default)]
    download_payload_rate: i64,
}

impl DelugeClient {
    pub fn new(config: &DownloadClientConfig) -> Result<Self> {
        Ok(Self {
            name: config.name.clone(),
            host: config.host.clone(),
            port: config.port,
            password: config.password.clone(),
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1")
                .build()
                .map_err(|e| AppError::Config(format!("HTTP client: {e}")))?,
        })
    }

    fn rpc_url(&self) -> String {
        format!("http://{}:{}/json", self.host, self.port)
    }

    async fn rpc_call_raw(&self, method: &str, params: Vec<Value>) -> Result<RpcResponse> {
        let body = RpcRequest {
            method: method.into(),
            params,
            id: 1,
        };

        let resp = self
            .client
            .post(&self.rpc_url())
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("Deluge connection failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Provider(format!(
                "Deluge returned HTTP {}",
                resp.status()
            )));
        }

        let rpc: RpcResponse = resp.json().await.map_err(|e| {
            AppError::Provider(format!("Deluge bad JSON response: {e}"))
        })?;

        if let Some(err) = &rpc.error {
            return Err(AppError::Provider(format!(
                "Deluge RPC error ({}): {}",
                err.code, err.message
            )));
        }

        Ok(rpc)
    }

    async fn authenticated_rpc(&self, method: &str, params: Vec<Value>) -> Result<Value> {
        let login_params = vec![json!(self.password.as_deref().unwrap_or(""))];

        let login_resp = self
            .client
            .post(&self.rpc_url())
            .json(&RpcRequest {
                method: "auth.login".into(),
                params: login_params,
                id: 1,
            })
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("Deluge login failed: {e}")))?;

        let cookie = login_resp
            .headers()
            .get("set-cookie")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
            .unwrap_or_default();

        let login_rpc: RpcResponse = login_resp.json().await.map_err(|e| {
            AppError::Provider(format!("Deluge bad login JSON: {e}"))
        })?;

        if let Some(err) = &login_rpc.error {
            return Err(AppError::Provider(format!(
                "Deluge auth.login error ({}): {}",
                err.code, err.message
            )));
        }

        let body = RpcRequest {
            method: method.into(),
            params,
            id: 2,
        };

        let mut req = self.client.post(&self.rpc_url()).json(&body);
        if !cookie.is_empty() {
            req = req.header("Cookie", &cookie);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("Deluge RPC failed: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Provider(format!(
                "Deluge returned HTTP {}",
                resp.status()
            )));
        }

        let rpc: RpcResponse = resp.json().await.map_err(|e| {
            AppError::Provider(format!("Deluge bad JSON response: {e}"))
        })?;

        if let Some(err) = &rpc.error {
            return Err(AppError::Provider(format!(
                "Deluge RPC error ({}): {}",
                err.code, err.message
            )));
        }

        Ok(rpc.result.unwrap_or(Value::Null))
    }

    fn map_state(state: &str, progress: f64) -> DownloadStatus {
        match state {
            "Error" => DownloadStatus::Failed(state.to_string()),
            "Seeding" => DownloadStatus::Seeding,
            "Queued" | "Paused" => DownloadStatus::Queued,
            "Finished" | "Completed" | "Checking" if progress >= 1.0 => DownloadStatus::Completed,
            "Finished" | "Completed" => DownloadStatus::Seeding,
            "Downloading" | "Allocating" | "Checking" | "Moving" => DownloadStatus::Downloading,
            _ if progress >= 1.0 => DownloadStatus::Completed,
            _ => DownloadStatus::Downloading,
        }
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

    async fn add_release(&self, release: &Release) -> Result<DownloadId> {
        let url = match &release.download_type {
            DownloadType::Magnet => release.download_url.clone(),
            _ => release.download_url.clone(),
        };

        let result = self
            .authenticated_rpc("core.add_torrent_url", vec![json!(url), json!({})])
            .await?;

        let hash = result
            .as_str()
            .ok_or_else(|| {
                AppError::Provider("Deluge did not return a torrent hash".into())
            })?
            .to_string();

        tracing::info!(client = %self.name, hash = %hash, "Torrent added via Deluge");
        Ok(DownloadId(hash))
    }

    async fn remove_download(&self, id: &DownloadId) -> Result<()> {
        self.authenticated_rpc(
            "core.remove_torrent",
            vec![json!(id.0), json!(false)],
        )
        .await?;
        tracing::info!(client = %self.name, id = %id.0, "Torrent removed from Deluge");
        Ok(())
    }

    async fn get_status(&self, id: &DownloadId) -> Result<DownloadStatus> {
        let result = self
            .authenticated_rpc(
                "core.get_torrent_status",
                vec![
                    json!(id.0),
                    json!(["state", "progress", "name", "total_size", "download_payload_rate"]),
                ],
            )
            .await?;

        if result.is_null() {
            return Ok(DownloadStatus::Removed);
        }

        let status: TorrentStatusFields = serde_json::from_value(result).map_err(|e| {
            AppError::Provider(format!("Deluge bad status response: {e}"))
        })?;

        Ok(Self::map_state(&status.state, status.progress))
    }

    async fn list_active(&self) -> Result<Vec<DownloadItem>> {
        let result = self
            .authenticated_rpc(
                "core.get_torrents_status",
                vec![
                    json!({}),
                    json!(["name", "state", "progress", "hash", "total_size", "download_payload_rate"]),
                ],
            )
            .await?;

        let torrents: HashMap<String, TorrentStatusFields> =
            serde_json::from_value(result).map_err(|e| {
                AppError::Provider(format!("Deluge bad torrents response: {e}"))
            })?;

        let items = torrents
            .into_iter()
            .map(|(hash, t)| DownloadItem {
                id: DownloadId(hash),
                name: t.name,
                status: Self::map_state(&t.state, t.progress),
                size: t.total_size,
                downloaded_bytes: (t.total_size as f64 * t.progress) as i64,
                progress: t.progress * 100.0,
                added_at: chrono::Utc::now(),
                estimated_completion: None,
            })
            .collect();

        Ok(items)
    }

    async fn get_config(&self) -> Result<ClientConfig> {
        let result = self
            .authenticated_rpc("daemon.info", vec![])
            .await?;

        let version = match &result {
            Value::String(s) => Some(s.clone()),
            Value::Object(_) => result
                .get("version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            _ => None,
        };

        let config_result = self
            .authenticated_rpc("core.get_config", vec![])
            .await
            .ok();

        let download_location = config_result
            .and_then(|v| {
                v.get("download_location")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            });

        Ok(ClientConfig {
            version,
            default_save_path: download_location,
            free_space: None,
        })
    }

    async fn get_download_path(&self, id: &DownloadId) -> Result<String> {
        let result = self
            .authenticated_rpc(
                "core.get_torrent_status",
                vec![json!(id.0), json!(["download_location", "name"])],
            )
            .await?;

        let download_location = result
            .get("download_location")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::NotFound("Download not found".into()))?;

        let name = result
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if download_location.is_empty() || name.is_empty() {
            return Err(AppError::NotFound("Download not found".into()));
        }

        Ok(format!("{}/{}", download_location, name))
    }
}
