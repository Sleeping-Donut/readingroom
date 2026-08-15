use async_trait::async_trait;
use readingroom_core::{
    config::MetadataConfig,
    error::{AppError, Result},
    models::*,
    traits::MetadataSource,
};

const BASE: &str = "https://www.googleapis.com/books/v1";

pub struct GoogleBooksSource {
    client: reqwest::Client,
    api_key: String,
}

impl GoogleBooksSource {
    pub fn new(config: &MetadataConfig) -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1 (https://github.com/user/readingroom)")
                .build()
                .expect("Failed to build HTTP client"),
            api_key: config.google_books.api_key.clone().unwrap_or_default(),
        }
    }
}

// -- API response types --

#[derive(serde::Deserialize)]
struct VolumeList {
    items: Option<Vec<Volume>>,
    total_items: Option<i64>,
}

#[derive(serde::Deserialize)]
struct Volume {
    id: String,
    volume_info: VolumeInfo,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct VolumeInfo {
    title: String,
    authors: Option<Vec<String>>,
    publisher: Option<String>,
    published_date: Option<String>,
    description: Option<String>,
    industry_identifiers: Option<Vec<Identifier>>,
    page_count: Option<i32>,
    categories: Option<Vec<String>>,
    language: Option<String>,
    image_links: Option<ImageLinks>,
}

#[derive(serde::Deserialize)]
struct Identifier {
    #[serde(rename = "type")]
    id_type: String,
    identifier: String,
}

#[derive(serde::Deserialize)]
struct ImageLinks {
    thumbnail: Option<String>,
    small_thumbnail: Option<String>,
}

// -- Helpers --

fn parse_year(s: &str) -> Option<chrono::NaiveDate> {
    let year: i32 = s.chars().take(4).collect::<String>().parse().ok()?;
    chrono::NaiveDate::from_ymd_opt(year, 1, 1)
}

fn extract_isbns(identifiers: &[Identifier]) -> (Option<String>, Option<String>) {
    let isbn13 = identifiers
        .iter()
        .find(|id| id.id_type == "ISBN_13")
        .map(|id| id.identifier.clone());
    let isbn10 = identifiers
        .iter()
        .find(|id| id.id_type == "ISBN_10")
        .map(|id| id.identifier.clone());
    (isbn10, isbn13)
}

fn map_volume_to_book(v: Volume) -> Book {
    let info = v.volume_info;
    let (isbn, isbn13) = info
        .industry_identifiers
        .as_deref()
        .map(extract_isbns)
        .unwrap_or((None, None));
    Book {
        id: 0,
        foreign_id: v.id,
        author_id: 0,
        author_name: None,
        title: info.title.clone(),
        clean_title: info.title.to_lowercase(),
        description: info.description,
        isbn,
        isbn13,
        asin: None,
        pages: info.page_count,
        publisher: info.publisher,
        publish_date: info.published_date.as_deref().and_then(parse_year),
        image_url: info.image_links.and_then(|l| l.thumbnail),
        genres: info.categories.unwrap_or_default(),
        ratings: None,
        language: info.language.unwrap_or_else(|| "en".into()),
        monitored: false,
        added_at: chrono::Utc::now(),
        last_search_at: None,
    }
}

fn map_volume_to_author(v: Volume) -> Option<Author> {
    let info = v.volume_info;
    let name = info.authors?.into_iter().next()?;
    let foreign_id = name.replace('.', " ");
    Some(Author {
        id: 0,
        foreign_id,
        name,
        sort_name: None,
        biography: None,
        image_url: None,
        birth_date: None,
        death_date: None,
        genres: vec![],
        aliases: vec![],
        links: vec![],
        monitored: false,
        added_at: chrono::Utc::now(),
        tags: vec![],
    })
}

#[async_trait]
impl MetadataSource for GoogleBooksSource {
    fn name(&self) -> &'static str {
        "google_books"
    }

    async fn search_author(&self, query: &str) -> Result<Vec<Author>> {
        let url = format!(
            "{BASE}/volumes?q=inauthor:{query}&key={api_key}&maxResults=40",
            api_key = self.api_key
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!(
                "Google Books returned {}",
                resp.status()
            )));
        }
        let body: VolumeList = resp.json().await?;
        let authors: Vec<Author> = body
            .items
            .unwrap_or_default()
            .into_iter()
            .filter_map(map_volume_to_author)
            .collect();
        let mut seen = std::collections::HashSet::new();
        Ok(authors.into_iter().filter(|a| seen.insert(a.name.clone())).collect())
    }

    async fn get_author(&self, _foreign_id: &str) -> Result<Author> {
        Err(AppError::NotFound(
            "Google Books does not support author lookup by ID".into(),
        ))
    }

    async fn get_author_books(&self, _foreign_id: &str) -> Result<Vec<Book>> {
        Ok(vec![])
    }

    async fn search_book(&self, query: &str) -> Result<Vec<Book>> {
        let url = format!(
            "{BASE}/volumes?q={query}&key={api_key}&maxResults=40",
            api_key = self.api_key
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!(
                "Google Books returned {}",
                resp.status()
            )));
        }
        let body: VolumeList = resp.json().await?;
        Ok(body
            .items
            .unwrap_or_default()
            .into_iter()
            .map(map_volume_to_book)
            .collect())
    }

    async fn get_book(&self, foreign_id: &str) -> Result<Book> {
        let url = format!(
            "{BASE}/volumes/{foreign_id}?key={api_key}",
            foreign_id = foreign_id,
            api_key = self.api_key
        );
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::NotFound(format!("Book {foreign_id} not found")));
        }
        let volume: Volume = resp.json().await?;
        Ok(map_volume_to_book(volume))
    }

    async fn get_book_editions(&self, _foreign_id: &str) -> Result<Vec<Edition>> {
        Ok(vec![])
    }

    async fn get_series(&self, _foreign_id: &str) -> Result<Series> {
        Err(AppError::NotFound(
            "Google Books does not support series lookup".into(),
        ))
    }
}
