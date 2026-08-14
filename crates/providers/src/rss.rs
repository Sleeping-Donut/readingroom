use async_trait::async_trait;
use chrono::{DateTime, Utc};
use readingroom_core::{
    config::IndexerConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{Indexer, SearchCriteria},
};

pub struct RssIndexer {
    name: String,
    feed_url: String,
    client: reqwest::Client,
    accept_magnet: bool,
    accept_torrent: bool,
    accept_direct: bool,
}

impl RssIndexer {
    pub fn new(config: &IndexerConfig) -> Result<Self> {
        Ok(Self {
            name: config.name.clone(),
            feed_url: config.url.trim_end_matches('/').to_string(),
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1")
                .build()
                .map_err(|e| AppError::Config(format!("HTTP client: {e}")))?,
            accept_magnet: true,
            accept_torrent: true,
            accept_direct: true,
        })
    }

    async fn fetch(&self, feed_url: &str) -> Result<Vec<Release>> {
        let resp = self
            .client
            .get(feed_url)
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("RSS request: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Provider(format!("RSS HTTP {}", resp.status())));
        }

        let bytes = resp.bytes().await.map_err(|e| {
            AppError::Provider(format!("RSS read: {e}"))
        })?;

        self.parse_response(&bytes)
    }

    fn parse_response(&self, data: &[u8]) -> Result<Vec<Release>> {
        let feed = feed_rs::parser::parse(data)
            .map_err(|e| AppError::Provider(format!("RSS parse error: {e}")))?;

        let mut releases = Vec::new();

        for entry in feed.entries {
            let title = entry.title.map(|t| t.content).unwrap_or_default();
            if title.is_empty() {
                continue;
            }

            let info_url = entry.links.first().map(|l| l.href.clone()).unwrap_or_default();

            // Determine download URLs from links and enclosures
            let mut download_url = String::new();
            let mut download_type = DownloadType::Direct;
            let mut size: i64 = 0;

            // Check entry links for magnet/URL
            for link in &entry.links {
                let href = &link.href;
                if href.starts_with("magnet:") && self.accept_magnet {
                    download_url = href.clone();
                    download_type = DownloadType::Magnet;
                    break;
                }
                if href.ends_with(".torrent") && self.accept_torrent {
                    download_url = href.clone();
                    download_type = DownloadType::Torrent;
                    break;
                }
            }

            // Check media enclosures
            if download_url.is_empty() {
                for media in &entry.media {
                    for content in &media.content {
                        if let Some(url) = &content.url {
                            let url_str = url.as_str();
                            if url_str.starts_with("magnet:") && self.accept_magnet {
                                download_url = url_str.to_string();
                                download_type = DownloadType::Magnet;
                            } else if self.accept_torrent {
                                download_url = url_str.to_string();
                                download_type = DownloadType::Torrent;
                            }
                            if let Some(size_bytes) = content.size {
                                size = size_bytes as i64;
                            }
                            break;
                        }
                    }
                    if !download_url.is_empty() {
                        break;
                    }
                }
            }

            // Fallback: use the first link as download URL
            if download_url.is_empty() && !info_url.is_empty() && self.accept_direct {
                download_url = info_url.clone();
                download_type = DownloadType::Direct;
            }

            let pub_date = entry.published.map(|d| {
                let ts: DateTime<Utc> = d.into();
                ts
            }).unwrap_or_else(|| {
                entry.updated.map(|d| {
                    let ts: DateTime<Utc> = d.into();
                    ts
                }).unwrap_or(Utc::now())
            });

            // Extract categories
            let categories: Vec<String> = entry.categories.iter().map(|c| c.term.clone()).collect();

            if !download_url.is_empty() || !categories.is_empty() {
                releases.push(Release {
                    title: title.clone(),
                    info_url: info_url.clone(),
                    download_url: download_url.clone(),
                    size,
                    pub_date,
                    indexer: self.name.clone(),
                    download_type,
                    seeders: None,
                    peers: None,
                    grabs: None,
                    categories,
                });
            }
        }

        Ok(releases)
    }
}

#[async_trait]
impl Indexer for RssIndexer {
    fn name(&self) -> &str {
        &self.name
    }

    fn supports_rss(&self) -> bool {
        true
    }

    fn supports_search(&self) -> bool {
        false
    }

    async fn rss_sync(&self) -> Result<Vec<Release>> {
        self.fetch(&self.feed_url).await
    }

    async fn search(&self, _criteria: &SearchCriteria) -> Result<Vec<Release>> {
        Ok(vec![])
    }
}
