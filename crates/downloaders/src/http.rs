use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use async_trait::async_trait;
use futures_util::StreamExt;
use readingroom_core::{
    config::DownloadClientConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{ClientConfig, DownloadClient, DownloadId, DownloadItem, DownloadStatus},
};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

#[derive(Debug)]
struct DownloadProgress {
    total: u64,
    downloaded: u64,
    error: Option<String>,
    added_at: chrono::DateTime<chrono::Utc>,
    cancelled: Arc<AtomicBool>,
}

pub struct HttpDownloadClient {
    name: String,
    download_dir: PathBuf,
    client: reqwest::Client,
    rate_limit: Option<u64>,
    concurrency: Arc<tokio::sync::Semaphore>,
    active: Arc<Mutex<HashMap<String, DownloadProgress>>>,
}

impl HttpDownloadClient {
    pub fn new(config: &DownloadClientConfig) -> Result<Self> {
        let download_dir = config
            .download_dir
            .clone()
            .unwrap_or_else(|| std::path::PathBuf::from("./downloads"));
        std::fs::create_dir_all(&download_dir)?;

        let concurrency = config.concurrent_downloads.unwrap_or(2).max(1);

        Ok(Self {
            name: config.name.clone(),
            download_dir,
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1")
                .build()
                .map_err(|e| AppError::Config(format!("HTTP client: {e}")))?,
            rate_limit: config.rate_limit,
            concurrency: Arc::new(tokio::sync::Semaphore::new(concurrency)),
            active: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn ext_from_url(url: &str) -> String {
        url.split(['?', '#'])
            .next()
            .and_then(|p| Path::new(p).extension())
            .and_then(|e| e.to_str())
            .filter(|e| !e.is_empty())
            .map(|e| e.to_lowercase())
            .unwrap_or_else(|| "file".into())
    }

    fn sanitize_title(title: &str) -> String {
        let sanitized: String = title
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                    c
                } else {
                    ' '
                }
            })
            .collect();
        sanitized.trim().to_string()
    }

    /// Whether the URL looks like a JSON envelope endpoint (e.g. Anna's Archive
    /// `fast_download.json`) whose response must be resolved to a real file URL
    /// before the download can start.
    fn needs_envelope_resolution(url: &str) -> bool {
        let path = url.split(['?', '#']).next().unwrap_or(url).to_ascii_lowercase();
        path.contains("/api/") || path.ends_with(".json")
    }

    /// Resolve a JSON envelope (e.g. `{"download_url": "..."}`) to the real file
    /// URL. Returns the URL to stream plus the file extension from the resolved
    /// URL when one is available. Non-envelope responses are returned unchanged
    /// (the caller re-fetches them).
    async fn resolve_envelope(&self, url: &str) -> Result<(String, Option<String>)> {
        let resp = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("Resolve request: {e}")))?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!(
                "Download API returned {}",
                resp.status()
            )));
        }
        let is_json = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|ct| ct.to_ascii_lowercase().contains("json"))
            .unwrap_or(false);
        if !is_json {
            return Ok((url.to_string(), None));
        }

        let text = resp.text().await.map_err(|e| {
            AppError::Provider(format!("Resolve read: {e}"))
        })?;
        let value: serde_json::Value = serde_json::from_str(&text)
            .map_err(|_| AppError::Provider("Download API returned invalid JSON".into()))?;

        if let Some(dl) = value
            .get("download_url")
            .and_then(|d| d.as_str())
            .filter(|s| s.starts_with("http"))
        {
            let ext = Self::ext_from_url(dl);
            return Ok((dl.to_string(), Some(ext)));
        }
        if let Some(err) = value.get("error").and_then(|e| e.as_str()) {
            return Err(AppError::Provider(format!("Download API error: {err}")));
        }
        Ok((url.to_string(), None))
    }
}

/// Whether the download directory contains a finished (non-`.part`) file.
fn has_final_file(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            if !name.ends_with(".part") {
                return true;
            }
        }
    }
    false
}

/// Stream the response body to `part_path` (respecting an optional byte/sec
/// rate limit), then rename it to `final_path`. Progress is recorded in
/// `active` under `title`.
async fn stream_download(
    client: reqwest::Client,
    url: String,
    part_path: PathBuf,
    final_path: PathBuf,
    rate_limit: Option<u64>,
    cancelled: Arc<AtomicBool>,
    active: Arc<Mutex<HashMap<String, DownloadProgress>>>,
    title: String,
) -> Result<()> {
    let resp = client.get(&url).send().await?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Provider(format!("HTTP download returned {status}")));
    }
    let total = resp.content_length().unwrap_or(0);

    {
        let mut m = active.lock().await;
        if let Some(p) = m.get_mut(&title) {
            p.total = total;
        }
    }

    let mut out = tokio::fs::File::create(&part_path).await?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let start = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        if cancelled.load(Ordering::Relaxed) {
            return Err(AppError::Other("Download cancelled".into()));
        }
        let chunk = chunk?;
        out.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        {
            let mut m = active.lock().await;
            if let Some(p) = m.get_mut(&title) {
                p.downloaded = downloaded;
            }
        }

        if let Some(rate) = rate_limit.filter(|r| *r > 0) {
            let expected = std::time::Duration::from_secs_f64(downloaded as f64 / rate as f64);
            let elapsed = start.elapsed();
            if expected > elapsed {
                tokio::time::sleep(expected - elapsed).await;
            }
        }
    }

    out.flush().await?;
    drop(out);
    tokio::fs::rename(&part_path, &final_path).await?;
    Ok(())
}

#[async_trait]
impl DownloadClient for HttpDownloadClient {
    fn name(&self) -> &str {
        &self.name
    }

    fn protocol(&self) -> DownloadType {
        DownloadType::Direct
    }

    async fn add_release(&self, release: &Release) -> Result<DownloadId> {
        // Resolve JSON envelope endpoints (e.g. Anna's Archive fast_download)
        // to the real file URL before naming the file.
        let download_url = release.download_url.clone();
        let (url, resolved_ext) = if Self::needs_envelope_resolution(&download_url) {
            self.resolve_envelope(&download_url).await?
        } else {
            (download_url, None)
        };
        let ext = resolved_ext.unwrap_or_else(|| Self::ext_from_url(&url));
        let title = Self::sanitize_title(&release.title);
        let id = DownloadId(title.clone());

        // One subdirectory per download so the import step can scan it like a
        // torrent client's completed download folder.
        let dir = self.download_dir.join(&title);
        tokio::fs::create_dir_all(&dir).await?;
        let part_path = dir.join(format!("{title}.{ext}.part"));
        let final_path = dir.join(format!("{title}.{ext}"));

        let cancelled = Arc::new(AtomicBool::new(false));
        {
            let mut active = self.active.lock().await;
            active.insert(
                title.clone(),
                DownloadProgress {
                    total: release.size.max(0) as u64,
                    downloaded: 0,
                    error: None,
                    added_at: chrono::Utc::now(),
                    cancelled: cancelled.clone(),
                },
            );
        }

        let client = self.client.clone();
        let semaphore = self.concurrency.clone();
        let active_map = self.active.clone();
        let rate_limit = self.rate_limit;
        let name = self.name.clone();

        tracing::info!(client = %name, file = %final_path.display(), "Direct HTTP download queued");

        // Spawn the download in the background and return immediately. The
        // semaphore permits `concurrent_downloads` downloads at a time; excess
        // releases queue up until a permit frees.
        tokio::spawn(async move {
            let _permit = semaphore.acquire_owned().await;
            let result = stream_download(
                client,
                url,
                part_path,
                final_path,
                rate_limit,
                cancelled.clone(),
                active_map.clone(),
                title.clone(),
            )
            .await;

            match result {
                Ok(()) => {
                    let mut m = active_map.lock().await;
                    m.remove(&title);
                }
                Err(e) => {
                    if !cancelled.load(Ordering::Relaxed) {
                        let mut m = active_map.lock().await;
                        if let Some(p) = m.get_mut(&title) {
                            p.error = Some(e.to_string());
                        }
                    }
                }
            }
        });

        Ok(id)
    }

    async fn remove_download(&self, id: &DownloadId) -> Result<()> {
        let path = self.download_dir.join(&id.0);
        {
            let mut active = self.active.lock().await;
            if let Some(p) = active.remove(&id.0) {
                p.cancelled.store(true, Ordering::Relaxed);
            }
        }
        match tokio::fs::remove_dir_all(&path).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    async fn get_status(&self, id: &DownloadId) -> Result<DownloadStatus> {
        let dir = self.download_dir.join(&id.0);
        if has_final_file(&dir) {
            return Ok(DownloadStatus::Completed);
        }

        let active = self.active.lock().await;
        match active.get(&id.0) {
            Some(p) => {
                if let Some(err) = &p.error {
                    Ok(DownloadStatus::Failed(err.clone()))
                } else {
                    Ok(DownloadStatus::Downloading)
                }
            }
            None => Ok(DownloadStatus::Failed("File not found".into())),
        }
    }

    async fn list_active(&self) -> Result<Vec<DownloadItem>> {
        let active = self.active.lock().await;
        let mut items = Vec::new();
        for (id, p) in active.iter() {
            let status = if let Some(err) = &p.error {
                DownloadStatus::Failed(err.clone())
            } else {
                DownloadStatus::Downloading
            };
            let progress = if p.total > 0 {
                (p.downloaded as f64 / p.total as f64) * 100.0
            } else {
                0.0
            };
            items.push(DownloadItem {
                id: DownloadId(id.clone()),
                name: id.clone(),
                status,
                size: p.total as i64,
                downloaded_bytes: p.downloaded as i64,
                progress,
                added_at: p.added_at,
                estimated_completion: None,
            });
        }
        Ok(items)
    }

    async fn get_config(&self) -> Result<ClientConfig> {
        Ok(ClientConfig {
            version: Some("direct-http".into()),
            default_save_path: Some(self.download_dir.display().to_string()),
            free_space: None,
        })
    }

    async fn get_download_path(&self, id: &DownloadId) -> Result<String> {
        Ok(self
            .download_dir
            .join(&id.0)
            .to_string_lossy()
            .into_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use readingroom_core::models::Release;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    fn spawn_test_server(body: &'static [u8], delay_ms: u64) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf).unwrap();
            std::thread::sleep(Duration::from_millis(delay_ms));
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(body);
            let _ = stream.flush();
        });
        format!("http://{addr}/book.epub")
    }

    #[tokio::test]
    async fn downloads_release_from_url() {
        let body: &'static [u8] = b"fake epub bytes";
        let url = spawn_test_server(body, 200);

        let temp = std::env::temp_dir().join(format!("rr_http_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp);

        let config = DownloadClientConfig {
            name: "http".into(),
            implementation: "http".into(),
            host: String::new(),
            port: 0,
            username: None,
            password: None,
            url_base: None,
            category: None,
            download_dir: Some(temp.clone()),
            enabled: true,
            rate_limit: None,
            concurrent_downloads: None,
            priority: 0,
        };

        let client = HttpDownloadClient::new(&config).unwrap();
        let release = Release {
            title: "Some Title/With Symbols".into(),
            info_url: String::new(),
            download_url: url,
            size: body.len() as i64,
            pub_date: Utc::now(),
            indexer: "test".into(),
            download_type: DownloadType::Direct,
            seeders: None,
            peers: None,
            grabs: None,
            categories: vec![],
        };

        let id = client.add_release(&release).await.unwrap();
        assert_eq!(id.0, "Some Title With Symbols");

        // add_release is non-blocking: the download runs in the background, so
        // immediately after it returns the download is still in progress.
        assert!(matches!(
            client.get_status(&id).await.unwrap(),
            DownloadStatus::Downloading
        ));

        // Poll until the background download renames the file into place.
        let mut completed = false;
        for _ in 0..200 {
            if matches!(
                client.get_status(&id).await.unwrap(),
                DownloadStatus::Completed
            ) {
                completed = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(completed, "download did not complete in time");

        let path = temp.join(&id.0).join("Some Title With Symbols.epub");
        assert_eq!(std::fs::read(&path).unwrap(), body);

        client.remove_download(&id).await.unwrap();
        assert!(!path.exists());

        let _ = std::fs::remove_dir_all(&temp);
    }

    /// Serves a JSON envelope on `/fast_download.json` pointing at `/book.epub`.
    fn spawn_envelope_server() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buf = [0u8; 4096];
                let _ = stream.read(&mut buf).unwrap();
                let request = String::from_utf8_lossy(&buf[..buf.iter().position(|b| *b == b'\r').unwrap_or(buf.len())]);
                let body: String = if request.contains("fast_download.json") {
                    format!(
                        r#"{{"download_url":"http://{addr}/book.epub","account_fast_download_info":{{"downloads_per_day":100,"downloads_left":99}}}}"#
                    )
                } else {
                    "fake epub bytes".to_string()
                };
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    if request.contains("fast_download.json") { "application/json" } else { "application/epub+zip" },
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(body.as_bytes());
                let _ = stream.flush();
            }
        });
        format!("http://{addr}/dyn/api/fast_download.json?md5=abc123")
    }

    #[tokio::test]
    async fn resolves_envelope_before_download() {
        let url = spawn_envelope_server();
        let temp = std::env::temp_dir().join(format!("rr_http_env_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp);

        let config = DownloadClientConfig {
            name: "http".into(),
            implementation: "http".into(),
            host: String::new(),
            port: 0,
            username: None,
            password: None,
            url_base: None,
            category: None,
            download_dir: Some(temp.clone()),
            enabled: true,
            rate_limit: None,
            concurrent_downloads: None,
            priority: 0,
        };

        let client = HttpDownloadClient::new(&config).unwrap();
        let release = Release {
            title: "Envelope Book".into(),
            info_url: String::new(),
            download_url: url,
            size: 15,
            pub_date: Utc::now(),
            indexer: "anna".into(),
            download_type: DownloadType::Direct,
            seeders: None,
            peers: None,
            grabs: None,
            categories: vec![],
        };

        let id = client.add_release(&release).await.unwrap();

        let mut completed = false;
        for _ in 0..200 {
            if matches!(
                client.get_status(&id).await.unwrap(),
                DownloadStatus::Completed
            ) {
                completed = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(completed, "download did not complete in time");

        // The extension comes from the resolved URL, not fast_download.json.
        let path = temp.join(&id.0).join("Envelope Book.epub");
        assert_eq!(std::fs::read(&path).unwrap(), b"fake epub bytes");

        let _ = std::fs::remove_dir_all(&temp);
    }
}
