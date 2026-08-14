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

pub struct NewznabIndexer {
    name: String,
    search_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl NewznabIndexer {
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
            .map_err(|e| AppError::Provider(format!("Newznab request: {e}")))?;

        if !resp.status().is_success() {
            return Err(AppError::Provider(format!(
                "Newznab HTTP {}",
                resp.status()
            )));
        }

        let bytes = resp.bytes().await.map_err(|e| {
            AppError::Provider(format!("Newznab read: {e}"))
        })?;

        self.parse_response(&bytes)
    }

    fn parse_response(&self, xml: &[u8]) -> Result<Vec<Release>> {
        let mut reader = Reader::from_reader(xml);
        reader.config_mut().trim_text(true);

        let mut releases = Vec::new();
        let mut in_item = false;

        let mut title = String::new();
        let mut info_url = String::new();
        let mut download_url = String::new();
        let mut download_type = DownloadType::NZB;
        let mut size: i64 = 0;
        let mut pub_date = Utc::now();
        let mut seeders: Option<i32> = None;
        let mut peers: Option<i32> = None;
        let mut grabs: Option<i32> = None;
        let mut categories: Vec<String> = Vec::new();
        let mut current_tag = Vec::new();

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    let qname = e.name();
                    let name = qname.as_ref();

                    match name {
                        b"item" => {
                            in_item = true;
                            title.clear();
                            info_url.clear();
                            download_url.clear();
                            download_type = DownloadType::NZB;
                            size = 0;
                            categories.clear();
                            seeders = None;
                            peers = None;
                            grabs = None;
                        }
                        b"enclosure" => {
                            for attr in e.attributes().flatten() {
                                let val = String::from_utf8_lossy(&attr.value);
                                match attr.key.as_ref() {
                                    b"url" => download_url = val.into_owned(),
                                    b"length" => size = val.parse().unwrap_or(0),
                                    b"type" => {
                                        if val.contains("nzb") {
                                            download_type = DownloadType::NZB;
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        _ => {
                            if name.ends_with(b":attr") || name.contains(&b':') {
                                let mut attr_name = String::new();
                                let mut attr_value = String::new();
                                for attr in e.attributes().flatten() {
                                    let val = String::from_utf8_lossy(&attr.value);
                                    match attr.key.as_ref() {
                                        b"name" => attr_name = val.into_owned(),
                                        b"value" => attr_value = val.into_owned(),
                                        _ => {}
                                    }
                                }
                                match attr_name.as_str() {
                                    "seeders" => seeders = attr_value.parse().ok(),
                                    "peers" => peers = attr_value.parse().ok(),
                                    "grabs" => grabs = attr_value.parse().ok(),
                                    "size" if size == 0 => size = attr_value.parse().unwrap_or(0),
                                    _ => {}
                                }
                                continue;
                            }
                            current_tag = name.to_vec();
                        }
                    }
                }

                Ok(Event::End(ref e)) => {
                    let qname = e.name();
                    let name = qname.as_ref();
                    match name {
                        b"item" => {
                            if !download_url.is_empty() || (!title.is_empty() && !categories.is_empty()) {
                                releases.push(Release {
                                    title: std::mem::take(&mut title),
                                    info_url: std::mem::take(&mut info_url),
                                    download_url: std::mem::take(&mut download_url),
                                    size,
                                    pub_date,
                                    indexer: self.name.clone(),
                                    download_type: download_type.clone(),
                                    seeders,
                                    peers,
                                    grabs,
                                    categories: std::mem::take(&mut categories),
                                });
                            }
                            in_item = false;
                        }
                        _ => {}
                    }
                }

                Ok(Event::Text(ref e)) => {
                    if in_item {
                        let text = e.decode().unwrap_or_default();
                        match current_tag.as_slice() {
                            b"title" => title = text.into_owned(),
                            b"link" if info_url.is_empty() => info_url = text.into_owned(),
                            b"pubDate" => {
                                pub_date = DateTime::parse_from_rfc2822(&text)
                                    .map(|d| d.with_timezone(&Utc))
                                    .unwrap_or(Utc::now());
                            }
                            b"category" => categories.push(text.into_owned()),
                            b"guid" if download_url.is_empty() => {
                                if text.starts_with("magnet:") {
                                    download_url = text.into_owned();
                                    download_type = DownloadType::Magnet;
                                } else if text.ends_with(".nzb") {
                                    download_url = text.into_owned();
                                }
                            }
                            _ => {}
                        }
                    }
                }

                Ok(Event::Eof) => break,
                Err(e) => {
                    return Err(AppError::Provider(format!(
                        "Newznab XML parse error: {e}"
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
impl Indexer for NewznabIndexer {
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
