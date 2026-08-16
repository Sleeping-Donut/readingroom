use async_trait::async_trait;
use readingroom_core::{
    error::{AppError, Result},
    models::*,
    traits::MetadataSource,
};

const BASE: &str = "https://api.audnex.us";

pub struct AudibleSource {
    client: reqwest::Client,
}

impl AudibleSource {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1 (https://github.com/user/readingroom)")
                .build()
                .expect("Failed to build HTTP client"),
        }
    }
}

// -- API response types --

#[derive(serde::Deserialize)]
struct AuthorResponse {
    asin: String,
    name: String,
    description: Option<String>,
    image: Option<String>,
    #[serde(default)]
    genres: Vec<GenreEntry>,
}

#[derive(serde::Deserialize)]
struct GenreEntry {
    name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookResponse {
    asin: String,
    #[serde(default)]
    authors: Vec<BookAuthor>,
    description: Option<String>,
    genres: Option<Vec<GenreEntry>>,
    image: Option<String>,
    isbn: Option<String>,
    language: Option<String>,
    publisher_name: Option<String>,
    rating: Option<serde_json::Value>,
    release_date: Option<String>,
    runtime_length_min: Option<i32>,
    summary: Option<String>,
    title: String,
}

#[derive(serde::Deserialize)]
struct BookAuthor {
    asin: String,
    name: String,
}

// -- Helpers --

fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

fn parse_date(s: &str) -> Option<chrono::NaiveDate> {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

fn parse_rating(value: Option<serde_json::Value>) -> Option<f64> {
    match value {
        Some(serde_json::Value::Number(n)) => n.as_f64(),
        Some(serde_json::Value::String(s)) => s.parse().ok(),
        _ => None,
    }
}

fn map_author(resp: AuthorResponse) -> Author {
    let genres: Vec<String> = resp.genres.iter().map(|g| g.name.clone()).collect();
    Author {
        id: 0,
        foreign_id: resp.asin,
        name: resp.name,
        sort_name: None,
        biography: resp.description,
        image_url: resp.image,
        birth_date: None,
        death_date: None,
        genres,
        aliases: vec![],
        links: vec![],
        monitored: false,
        added_at: chrono::Utc::now(),
        tags: vec![],
    }
}

fn map_book(body: BookResponse) -> Book {
    let description = body
        .description
        .as_deref()
        .or(body.summary.as_deref())
        .map(strip_html);

    let genres: Vec<String> = body
        .genres
        .unwrap_or_default()
        .iter()
        .map(|g| g.name.clone())
        .collect();

    let title = body.title;
    Book {
        id: 0,
        foreign_id: body.asin.clone(),
        author_id: 0,
        author_name: None,
        title: title.clone(),
        clean_title: title.to_lowercase(),
        description,
        isbn: body.isbn.clone(),
        isbn13: None,
        asin: Some(body.asin),
        pages: body.runtime_length_min,
        publisher: body.publisher_name,
        publish_date: body.release_date.as_deref().and_then(parse_date),
        image_url: body.image,
        genres,
        ratings: parse_rating(body.rating),
        language: body.language.unwrap_or_else(|| "en".into()),
        monitored: false,
        status: "tracked".into(),
        added_at: chrono::Utc::now(),
        last_search_at: None,
    }
}

#[async_trait]
impl MetadataSource for AudibleSource {
    fn name(&self) -> &'static str {
        "audible"
    }

    async fn search_author(&self, query: &str) -> Result<Vec<Author>> {
        let url = format!("{BASE}/authors?name={query}");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!("audnex.us returned {}", resp.status())));
        }
        let body: Vec<AuthorResponse> = resp.json().await?;
        Ok(body.into_iter().map(map_author).collect())
    }

    async fn get_author(&self, foreign_id: &str) -> Result<Author> {
        let url = format!("{BASE}/authors/{foreign_id}");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::NotFound(format!("Author {foreign_id} not found")));
        }
        let body: AuthorResponse = resp.json().await?;
        Ok(map_author(body))
    }

    async fn get_author_books(&self, _foreign_id: &str) -> Result<Vec<Book>> {
        Ok(vec![])
    }

    async fn search_book(&self, _query: &str) -> Result<Vec<Book>> {
        Ok(vec![])
    }

    async fn get_book(&self, foreign_id: &str) -> Result<Book> {
        let url = format!("{BASE}/books/{foreign_id}");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::NotFound(format!("Book {foreign_id} not found")));
        }
        let body: BookResponse = resp.json().await?;
        Ok(map_book(body))
    }

    async fn get_book_editions(&self, _foreign_id: &str) -> Result<Vec<Edition>> {
        Ok(vec![])
    }

    async fn get_series(&self, _foreign_id: &str) -> Result<Series> {
        Err(AppError::NotFound("Audible does not support series lookup".into()))
    }
}
