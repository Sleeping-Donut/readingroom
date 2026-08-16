use std::path::Path;

use async_trait::async_trait;
use readingroom_core::{
    config::DownloadClientConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{ClientConfig, DownloadClient, DownloadId, DownloadItem, DownloadStatus},
};

pub struct HttpDownloadClient {
    name: String,
    download_dir: std::path::PathBuf,
    client: reqwest::Client,
}

impl HttpDownloadClient {
    pub fn new(config: &DownloadClientConfig) -> Result<Self> {
        let download_dir = config
            .download_dir
            .clone()
            .unwrap_or_else(|| std::path::PathBuf::from("./downloads"));
        std::fs::create_dir_all(&download_dir)?;

        Ok(Self {
            name: config.name.clone(),
            download_dir,
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1")
                .build()
                .map_err(|e| AppError::Config(format!("HTTP client: {e}")))?,
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
        let ext = Self::ext_from_url(&release.download_url);
        let title = Self::sanitize_title(&release.title);
        let filename = format!("{title}.{ext}");
        let dest = self.download_dir.join(&filename);

        let resp = self
            .client
            .get(&release.download_url)
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("HTTP download failed: {e}")))?;

        let status = resp.status();
        if !status.is_success() {
            return Err(AppError::Provider(format!(
                "HTTP download returned {status}"
            )));
        }

        let bytes = resp.bytes().await.map_err(|e| {
            AppError::Provider(format!("HTTP download read failed: {e}"))
        })?;
        std::fs::write(&dest, bytes)?;

        tracing::info!(client = %self.name, file = %filename, "File downloaded via direct HTTP");
        Ok(DownloadId(filename))
    }

    async fn remove_download(&self, id: &DownloadId) -> Result<()> {
        let path = self.download_dir.join(&id.0);
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    async fn get_status(&self, id: &DownloadId) -> Result<DownloadStatus> {
        if self.download_dir.join(&id.0).exists() {
            Ok(DownloadStatus::Completed)
        } else {
            Ok(DownloadStatus::Failed("File not found".into()))
        }
    }

    async fn list_active(&self) -> Result<Vec<DownloadItem>> {
        Ok(vec![])
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

    fn spawn_test_server(body: &'static [u8]) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf).unwrap();
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
        let url = spawn_test_server(body);

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
        assert_eq!(id.0, "Some Title With Symbols.epub");

        let path = temp.join(&id.0);
        assert_eq!(std::fs::read(&path).unwrap(), body);
        assert!(matches!(
            client.get_status(&id).await.unwrap(),
            DownloadStatus::Completed
        ));

        client.remove_download(&id).await.unwrap();
        assert!(!path.exists());

        let _ = std::fs::remove_dir_all(&temp);
    }
}
