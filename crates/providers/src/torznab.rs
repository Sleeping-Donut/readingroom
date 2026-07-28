use async_trait::async_trait;
use chrono::{DateTime, Utc};
use quick_xml::events::Event;
use quick_xml::Reader;
use readingroom_core::{
    config::IndexerConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{Indexer, SearchCriteria},
};

pub struct TorznabIndexer {
    name: String,
    search_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl TorznabIndexer {
    pub fn new(config: &IndexerConfig) -> Result<Self> {
        let base = config.url.trim_end_matches('/').to_string();
        let search_url = format!("{base}/api");
        Ok(Self {
            name: config.name.clone(),
            search_url,
            api_key: config.api_key.clone(),
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1")
                .build()
                .map_err(|e| AppError::Config(format!("HTTP client: {e}")))?,
        })
    }

    async fn fetch(&self, params: Vec<(&str, &str)>) -> Result<Vec<Release>> {
        let mut url = reqwest::Url::parse(&self.search_url)
            .map_err(|e| AppError::Provider(format!("Bad URL: {e}")))?;

        url.query_pairs_mut()
            .extend_pairs(params)
            .extend_pairs([("t", "search"), ("extended", "1")]);

        if let Some(key) = &self.api_key {
            url.query_pairs_mut().append_pair("apikey", key);
        }

        let resp = self
            .client
            .get(url.as_str())
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("Torznab request: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Provider(format!(
                "Torznab HTTP {}",
                resp.status()
            )));
        }

        let bytes = resp.bytes().await.map_err(|e| {
            AppError::Provider(format!("Torznab read: {e}"))
        })?;

        self.parse_response(&bytes)
    }

    fn parse_response(&self, xml: &[u8]) -> Result<Vec<Release>> {
        let mut reader = Reader::from_reader(xml);
        reader.config_mut().trim_text(true);

        let mut releases = Vec::new();
        let mut in_item = false;
        let mut in_channel = false;

        let mut title = String::new();
        let mut info_url = String::new();
        let mut download_url = String::new();
        let mut download_type = DownloadType::Torrent;
        let mut size: i64 = 0;
        let mut pub_date = Utc::now();
        let mut seeders: Option<i32> = None;
        let mut peers: Option<i32> = None;
        let mut grabs: Option<i32> = None;
        let mut categories: Vec<String> = Vec::new();
        let mut current_tag = String::new();

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();

                    match name.as_str() {
                        "channel" => in_channel = true,
                        "item" => {
                            in_item = true;
                            title.clear();
                            info_url.clear();
                            download_url.clear();
                            download_type = DownloadType::Torrent;
                            size = 0;
                            categories.clear();
                            seeders = None;
                            peers = None;
                            grabs = None;
                        }
                        "enclosure" => {
                            for attr in e.attributes().flatten() {
                                let k = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                                let v = String::from_utf8_lossy(&attr.value).to_string();
                                match k.as_str() {
                                    "url" => download_url = v,
                                    "length" => size = v.parse().unwrap_or(0),
                                    "type" => {
                                        if v.contains("bittorrent") || v.contains("torrent") {
                                            download_type = DownloadType::Torrent;
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        _ => {
                            if name.starts_with("torznab:attr") {
                                let mut attr_name = String::new();
                                let mut attr_value = String::new();
                                for attr in e.attributes().flatten() {
                                    let k = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                                    let v = String::from_utf8_lossy(&attr.value).to_string();
                                    if k == "name" {
                                        attr_name = v;
                                    } else if k == "value" {
                                        attr_value = v;
                                    }
                                }
                                match attr_name.as_str() {
                                    "seeders" => seeders = attr_value.parse().ok(),
                                    "peers" => peers = attr_value.parse().ok(),
                                    "grabs" => grabs = attr_value.parse().ok(),
                                    "size" if size == 0 => size = attr_value.parse().unwrap_or(0),
                                    _ => {}
                                }
                                // For self-closing torznab:attr tags, no need to track text
                                continue;
                            }
                            current_tag = name;
                        }
                    }
                }

                Ok(Event::End(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    match name.as_str() {
                        "item" => {
                            if !download_url.is_empty() || !title.is_empty() {
                                releases.push(Release {
                                    title: title.clone(),
                                    info_url: info_url.clone(),
                                    download_url: download_url.clone(),
                                    size,
                                    pub_date,
                                    indexer: self.name.clone(),
                                    download_type: download_type.clone(),
                                    seeders,
                                    peers,
                                    grabs,
                                    categories: categories.clone(),
                                });
                            }
                            in_item = false;
                        }
                        "channel" => in_channel = false,
                        _ => {}
                    }
                }

                Ok(Event::Text(ref e)) => {
                    if in_item {
                        let text = e.decode().unwrap_or_default().to_string();
                        match current_tag.as_str() {
                            "title" => title = text,
                            "link" if info_url.is_empty() => info_url = text,
                            "pubDate" => {
                                pub_date = DateTime::parse_from_rfc2822(&text)
                                    .map(|d| d.with_timezone(&Utc))
                                    .unwrap_or(Utc::now());
                            }
                            "category" => categories.push(text),
                            "guid" if download_url.is_empty() => {
                                // Could be a magnet or URL
                                if text.starts_with("magnet:") {
                                    download_url = text;
                                    download_type = DownloadType::Magnet;
                                }
                            }
                            _ => {}
                        }
                    } else if in_channel {
                        // Nothing special needed at channel level
                    }
                }

                Ok(Event::Eof) => break,
                Err(e) => {
                    return Err(AppError::Provider(format!(
                        "Torznab XML parse error: {e}"
                    )));
                }
                _ => {}
            }
            buf.clear();
        }

        Ok(releases)
    }
}

#[async_trait]
impl Indexer for TorznabIndexer {
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
        self.fetch(vec![]).await
    }

    async fn search(&self, criteria: &SearchCriteria) -> Result<Vec<Release>> {
        let mut params = Vec::new();
        if let Some(q) = &criteria.query {
            params.push(("q", q.as_str()));
        }
        if let Some(author) = &criteria.author {
            params.push(("author", author.as_str()));
        }
        if let Some(title) = &criteria.title {
            params.push(("title", title.as_str()));
        }
        if let Some(isbn) = &criteria.isbn {
            params.push(("isbn", isbn.as_str()));
        }
        self.fetch(params).await
    }
}
