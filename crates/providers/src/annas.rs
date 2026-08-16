use std::sync::OnceLock;

use async_trait::async_trait;
use chrono::Utc;
use readingroom_core::{
    config::IndexerConfig,
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{Indexer, SearchCriteria},
};
use regex::Regex;
use scraper::{Html, Selector};

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// Anna's Archive indexer. Searches the public search page and points
/// downloads at the keyed `fast_download` API (the programmatic download
/// endpoint, mirroring the reference integration in LazyLibrarian).
pub struct AnnaIndexer {
    name: String,
    base_url: String,
    api_key: Option<String>,
    client: reqwest::Client,
}

impl AnnaIndexer {
    pub fn new(config: &IndexerConfig) -> Result<Self> {
        let base_url = config.url.trim_end_matches('/').to_string();
        Ok(Self {
            name: config.name.clone(),
            base_url,
            api_key: config.api_key.clone(),
            client: reqwest::Client::builder()
                .user_agent(USER_AGENT)
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| AppError::Config(format!("HTTP client: {e}")))?,
        })
    }

    async fn search_page(&self, query: &str) -> Result<Vec<Release>> {
        let url = format!("{}/search?q={}&content=books&lang=all", self.base_url, query);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Provider(format!("Anna's Archive request: {e}")))?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!(
                "Anna's Archive HTTP {}",
                resp.status()
            )));
        }
        let html = resp.text().await.map_err(|e| {
            AppError::Provider(format!("Anna's Archive read: {e}"))
        })?;
        Ok(self.parse_results(&html))
    }

    fn parse_results(&self, html: &str) -> Vec<Release> {
        // Anna's Archive hides some markup inside HTML comments; strip them.
        let cleaned = html.replace("<!--", "").replace("-->", "");
        let document = Html::parse_document(&cleaned);

        let card_selector = Selector::parse("div[class*='pt-3'][class*='border-b']").unwrap();
        let link_selector = Selector::parse("a.js-vim-focus").unwrap();
        let author_selector = Selector::parse("div.text-amber-900").unwrap();
        let metadata_selector = Selector::parse("div.text-gray-800").unwrap();
        let filepath_selector = Selector::parse("div.text-gray-500").unwrap();

        let mut releases = Vec::new();
        for card in document.select(&card_selector) {
            let Some(link) = card.select(&link_selector).next() else {
                continue;
            };
            let title = link.text().collect::<String>().trim().to_string();
            let href = link.value().attr("href").unwrap_or("");
            let Some(hash) = href.split("md5/").nth(1) else {
                continue;
            };
            if hash.is_empty() || title.is_empty() {
                continue;
            }

            let author = card
                .select(&author_selector)
                .next()
                .and_then(|el| el.value().attr("data-content"))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();

            let metadata = card
                .select(&metadata_selector)
                .next()
                .map(|el| el.text().collect::<String>())
                .unwrap_or_default();

            let extension = extract_format(&metadata).or_else(|| {
                card.select(&filepath_selector).next().and_then(|el| {
                    let path = el.text().collect::<String>();
                    path.rsplit('.').next().map(|e| e.trim().to_lowercase())
                })
            });
            let size = extract_size(&metadata);

            let mut title = title;
            if !author.is_empty() && !title.to_lowercase().contains(&author.to_lowercase()) {
                title = format!("{author} - {title}");
            }
            if let Some(ext) = &extension {
                title = format!("{title} [{ext}]");
            }

            let mut download_url = format!("{}/dyn/api/fast_download.json?md5={hash}", self.base_url);
            if let Some(key) = &self.api_key {
                download_url.push_str(&format!("&key={key}"));
            }

            releases.push(Release {
                title,
                info_url: format!("{}/md5/{hash}", self.base_url),
                download_url,
                size,
                pub_date: Utc::now(),
                indexer: self.name.clone(),
                download_type: DownloadType::Direct,
                seeders: None,
                peers: None,
                grabs: None,
                categories: extension.into_iter().collect(),
            });
        }
        releases
    }
}

fn format_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)(?:·\s*|,\s*|\s)(PDF|EPUB|MOBI|AZW3|FB2|TXT|DJVU|CBR|CBZ|RTF|LIT|DOC|DOCX|HTML|HTM|LRF|MHT|ZIP|RAR)(?:\s*·|,)")
            .unwrap()
    })
}

fn size_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)(\d+\.?\d*)\s*([KMGT]B)").unwrap())
}

fn extract_format(metadata: &str) -> Option<String> {
    format_re()
        .captures(metadata)
        .map(|c| c[1].to_lowercase())
}

fn extract_size(metadata: &str) -> i64 {
    let Some(caps) = size_re().captures(metadata) else {
        return 0;
    };
    let value: f64 = caps[1].parse().unwrap_or(0.0);
    let unit = caps[2].to_ascii_uppercase();
    let bytes = match unit.as_str() {
        "KB" => value * 1024.0,
        "MB" => value * 1024.0 * 1024.0,
        "GB" => value * 1024.0 * 1024.0 * 1024.0,
        "TB" => value * 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => 0.0,
    };
    bytes as i64
}

#[async_trait]
impl Indexer for AnnaIndexer {
    fn name(&self) -> &str {
        &self.name
    }

    fn supports_rss(&self) -> bool {
        false
    }

    fn supports_search(&self) -> bool {
        true
    }

    async fn rss_sync(&self) -> Result<Vec<Release>> {
        Ok(vec![])
    }

    async fn search(&self, criteria: &SearchCriteria) -> Result<Vec<Release>> {
        let query = criteria
            .query
            .clone()
            .or_else(|| match (&criteria.title, &criteria.author) {
                (Some(title), Some(author)) => Some(format!("{author} {title}")),
                (Some(title), None) => Some(title.clone()),
                (None, Some(author)) => Some(author.clone()),
                _ => None,
            })
            .or_else(|| criteria.isbn.clone());

        let Some(query) = query else {
            return Ok(vec![]);
        };
        self.search_page(&query).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use readingroom_core::traits::SearchCriteria;

    const SAMPLE_HTML: &str = r#"
<html><body>
  <div class="pt-3 pb-3 border-b border-slate-200">
    <a class="js-vim-focus" href="/md5/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6">Foundation</a>
    <div class="text-amber-900" data-content="Isaac Asimov">Isaac Asimov</div>
    <div class="text-gray-800">English [en], PDF, 7.5MB, "Foundation.pdf"</div>
  </div>
  <div class="pt-3 pb-3 border-b border-slate-200">
    <a class="js-vim-focus" href="/md5/11111111111111111111111111111111">Dune</a>
    <div class="text-amber-900" data-content="Frank Herbert">Frank Herbert</div>
    <div class="text-gray-800">English [en], EPUB, 2.3 MB</div>
  </div>
</body></html>
"#;

    fn indexer() -> AnnaIndexer {
        AnnaIndexer {
            name: "test".into(),
            base_url: "https://annas-archive.org".into(),
            api_key: Some("secret".into()),
            client: reqwest::Client::new(),
        }
    }

    #[test]
    fn test_parse_results() {
        let releases = indexer().parse_results(SAMPLE_HTML);
        assert_eq!(releases.len(), 2);

        let first = &releases[0];
        assert_eq!(first.title, "Isaac Asimov - Foundation [pdf]");
        assert!(first.download_url.contains("/dyn/api/fast_download.json?md5=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"));
        assert!(first.download_url.contains("key=secret"));
        assert_eq!(first.info_url, "https://annas-archive.org/md5/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6");
        assert_eq!(first.size, (7.5 * 1024.0 * 1024.0) as i64);
        assert_eq!(first.categories, vec!["pdf".to_string()]);

        let second = &releases[1];
        assert_eq!(second.title, "Frank Herbert - Dune [epub]");
        assert_eq!(second.size, (2.3 * 1024.0 * 1024.0) as i64);
    }

    #[tokio::test]
    async fn test_search_requires_query() {
        let releases = indexer().search(&SearchCriteria {
            query: None,
            author: None,
            title: None,
            isbn: None,
            limit: None,
        })
        .await
        .unwrap();
        assert!(releases.is_empty());
    }
}
