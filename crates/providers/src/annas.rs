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
use scraper::{ElementRef, Html, Selector};

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
        let url = format!("{}/search?q={query}&content=books&lang=all", self.base_url);
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
        let html = resp
            .text()
            .await
            .map_err(|e| AppError::Provider(format!("Anna's Archive read: {e}")))?;
        Ok(self.parse_results(&html, &self.base_url))
    }

    fn parse_results(&self, html: &str, host: &str) -> Vec<Release> {
        // Anna's Archive hides some markup inside HTML comments; strip them.
        let cleaned = html.replace("<!--", "").replace("-->", "");
        let document = Html::parse_document(&cleaned);

        let link_selector =
            Selector::parse("h3 a[href*='/books/'], h3 a[href*='/md5/']").unwrap();
        let metadata_selector = Selector::parse("div.text-sm").unwrap();

        let mut releases = Vec::new();
        for link in document.select(&link_selector) {
            let href = link.value().attr("href").unwrap_or("");
            let Some(id) = book_id_from_href(href) else {
                continue;
            };
            let title = link.text().collect::<String>().trim().to_string();
            if title.is_empty() {
                continue;
            }

            // The metadata line ("{author} · {year} · {format} · {size} ·
            // {catalog}") is a sibling of the title's <h3> inside the card.
            let metadata = link
                .parent()
                .and_then(|h3| h3.parent())
                .and_then(ElementRef::wrap)
                .and_then(|card| {
                    card.select(&metadata_selector)
                        .find(|el| el.text().collect::<String>().contains('·'))
                })
                .map(|el| el.text().collect::<String>())
                .unwrap_or_default();

            let author = metadata.split('·').next().map(str::trim).unwrap_or("");
            let extension = extract_format(&metadata);
            let size = extract_size(&metadata);

            let mut title = title;
            if !author.is_empty() && !title.to_lowercase().contains(&author.to_lowercase()) {
                title = format!("{author} - {title}");
            }
            if let Some(ext) = &extension {
                title = format!("{title} [{ext}]");
            }

            let mut download_url = format!("{host}/dyn/api/fast_download.json?md5={id}");
            if let Some(key) = &self.api_key {
                download_url.push_str(&format!("&key={key}"));
            }
            let info_url = if id.len() == 32 {
                format!("{host}/md5/{id}")
            } else {
                format!("{host}/books/{id}")
            };

            releases.push(Release {
                title,
                info_url,
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

/// Extract the book identifier from a result link. Supports the current
/// `/books/<id>-<slug>` format and the legacy `/md5/<hash>` format.
fn book_id_from_href(href: &str) -> Option<String> {
    let path = href.split(['?', '#']).next()?;
    if let Some(id) = path.split("/md5/").nth(1) {
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    path.split("/books/")
        .nth(1)?
        .split('-')
        .next()
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn format_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)(?:·\s*|,\s*|\s)(PDF|EPUB|MOBI|AZW3|FB2|TXT|DJVU|CBR|CBZ|RTF|LIT|DOC|DOCX|HTML|HTM|LRF|MHT|ZIP|RAR|PDB|RB)(?:\s*·|,)")
            .unwrap()
    })
}

fn size_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)(\d+\.?\d*)\s*([KMGT]?B)").unwrap())
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
        "B" => value,
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
  <div class="flex gap-[18px] items-start">
    <div class="min-w-0 flex-1 pt-[2px]">
      <h3 class="font-bold text-lg leading-tight">
        <a href="https://annas-archive.org/books/5719046-foundation-5719046" class="custom-a">Foundation</a>
      </h3>
      <div class="text-sm text-[#666] mt-1">Isaac Asimov · 2004 · EPUB · 2.3 MB · Books catalog</div>
    </div>
  </div>
  <div class="flex gap-[18px] items-start">
    <div class="min-w-0 flex-1 pt-[2px]">
      <h3 class="font-bold text-lg leading-tight">
        <a href="https://annas-archive.org/md5/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" class="custom-a">Dune</a>
      </h3>
      <div class="text-sm text-[#666] mt-1">Frank Herbert · PDF · 7.5MB · Books catalog</div>
    </div>
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
        let releases = indexer().parse_results(SAMPLE_HTML, "https://annas-archive.org");
        assert_eq!(releases.len(), 2);

        let first = &releases[0];
        assert_eq!(first.title, "Isaac Asimov - Foundation [epub]");
        assert!(first.download_url.contains("/dyn/api/fast_download.json?md5=5719046"));
        assert!(first.download_url.contains("key=secret"));
        assert_eq!(
            first.info_url,
            "https://annas-archive.org/books/5719046"
        );
        assert_eq!(first.size, (2.3 * 1024.0 * 1024.0) as i64);
        assert_eq!(first.categories, vec!["epub".to_string()]);

        let second = &releases[1];
        assert_eq!(second.title, "Frank Herbert - Dune [pdf]");
        assert!(second.download_url.contains("md5=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"));
        assert_eq!(
            second.info_url,
            "https://annas-archive.org/md5/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
        );
        assert_eq!(second.size, (7.5 * 1024.0 * 1024.0) as i64);
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
