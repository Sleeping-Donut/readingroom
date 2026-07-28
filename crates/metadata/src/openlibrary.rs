use async_trait::async_trait;
use chrono::Datelike;
use readingroom_core::{
    error::{AppError, Result},
    models::*,
    traits::MetadataSource,
};

const BASE: &str = "https://openlibrary.org";

pub struct OpenLibrarySource {
    client: reqwest::Client,
}

impl OpenLibrarySource {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("ReadingRoom/0.1 (https://github.com/user/readingroom)")
                .build()
                .expect("Failed to build HTTP client"),
        }
    }
}

// -- OpenLibrary API response types --

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthorSearchResponse {
    num_found: i64,
    docs: Vec<AuthorDoc>,
}

#[derive(serde::Deserialize)]
struct AuthorDoc {
    key: String,
    name: String,
    #[serde(default)]
    alternate_names: Vec<String>,
    birth_date: Option<String>,
    death_date: Option<String>,
    top_work: Option<String>,
    work_count: Option<i64>,
    #[serde(default)]
    top_subjects: Vec<String>,
}

#[derive(serde::Deserialize)]
struct AuthorDetails {
    key: String,
    name: String,
    birth_date: Option<String>,
    death_date: Option<String>,
    bio: Option<serde_json::Value>,
    photos: Option<Vec<i64>>,
    links: Option<Vec<AuthorLink>>,
}

#[derive(serde::Deserialize)]
struct AuthorLink {
    url: String,
    title: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorksResponse {
    entries: Vec<WorkEntry>,
    size: Option<i64>,
}

#[derive(serde::Deserialize)]
struct WorkEntry {
    key: String,
    title: String,
    description: Option<serde_json::Value>,
    subjects: Option<Vec<String>>,
    first_publish_date: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BookSearchResponse {
    num_found: i64,
    docs: Vec<BookDoc>,
}

#[derive(serde::Deserialize)]
struct BookDoc {
    key: String,
    title: String,
    author_name: Option<Vec<String>>,
    author_key: Option<Vec<String>>,
    isbn: Option<Vec<String>>,
    publisher: Option<Vec<String>>,
    publish_year: Option<Vec<i32>>,
    number_of_pages_median: Option<i32>,
    cover_i: Option<i64>,
    subject: Option<Vec<String>>,
    language: Option<Vec<String>>,
    ratings_average: Option<f64>,
    first_publish_year: Option<i32>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditionsResponse {
    entries: Vec<EditionEntry>,
    size: Option<i64>,
}

#[derive(serde::Deserialize)]
struct EditionEntry {
    key: String,
    title: String,
    isbn_13: Option<Vec<String>>,
    isbn_10: Option<Vec<String>>,
    publishers: Option<Vec<String>>,
    publish_date: Option<String>,
    number_of_pages: Option<i32>,
    cover: Option<EditionCover>,
}

#[derive(serde::Deserialize)]
struct EditionCover {
    large: Option<String>,
    medium: Option<String>,
    small: Option<String>,
}

fn ol_id_from_key(key: &str) -> String {
    key.trim_start_matches('/').to_string()
}

fn cover_url(cover_id: i64, size: &str) -> Option<String> {
    Some(format!("https://covers.openlibrary.org/b/id/{cover_id}-{size}.jpg"))
}

fn parse_date(s: &str) -> Option<chrono::NaiveDate> {
    // OpenLibrary dates can be "2000", "2000-01", or "2000-01-01"
    if s.len() == 4 {
        chrono::NaiveDate::from_ymd_opt(s.parse().ok()?, 1, 1)
    } else if s.len() == 7 {
        let (y, m) = s.split_once('-')?;
        chrono::NaiveDate::from_ymd_opt(y.parse().ok()?, m.parse().ok()?, 1)
    } else {
        chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
    }
}

fn map_author_doc(doc: AuthorDoc) -> Author {
    Author {
        id: 0,
        foreign_id: ol_id_from_key(&doc.key),
        name: doc.name,
        sort_name: None,
        biography: None,
        image_url: None,
        birth_date: doc.birth_date.as_deref().and_then(parse_date),
        death_date: doc.death_date.as_deref().and_then(parse_date),
        genres: doc.top_subjects,
        aliases: doc.alternate_names,
        links: vec![],
        monitored: false,
        added_at: chrono::Utc::now(),
        tags: vec![],
    }
}

#[async_trait]
impl MetadataSource for OpenLibrarySource {
    fn name(&self) -> &'static str {
        "openlibrary"
    }

    async fn search_author(&self, query: &str) -> Result<Vec<Author>> {
        let url = format!("{BASE}/search/authors.json?q={query}");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!("OpenLibrary returned {}", resp.status())));
        }
        let body: AuthorSearchResponse = resp.json().await?;
        Ok(body.docs.into_iter().map(map_author_doc).collect())
    }

    async fn get_author(&self, foreign_id: &str) -> Result<Author> {
        let url = format!("{BASE}/authors/{foreign_id}.json");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::NotFound(format!("Author {foreign_id} not found")));
        }
        let details: AuthorDetails = resp.json().await?;

        let biography = details.bio.as_ref().and_then(|b| match b {
            serde_json::Value::String(s) => Some(s.clone()),
            serde_json::Value::Object(o) => o.get("value").and_then(|v| v.as_str().map(String::from)),
            _ => None,
        });

        let links = details
            .links
            .unwrap_or_default()
            .into_iter()
            .map(|l| Link {
                url: l.url,
                label: l.title,
            })
            .collect();

        Ok(Author {
            id: 0,
            foreign_id: ol_id_from_key(&details.key),
            name: details.name,
            sort_name: None,
            biography,
            image_url: details.photos.and_then(|p| p.first().copied()).and_then(|id| cover_url(id, "L")),
            birth_date: details.birth_date.as_deref().and_then(parse_date),
            death_date: details.death_date.as_deref().and_then(parse_date),
            genres: vec![],
            aliases: vec![],
            links,
            monitored: false,
            added_at: chrono::Utc::now(),
            tags: vec![],
        })
    }

    async fn get_author_books(&self, foreign_id: &str) -> Result<Vec<Book>> {
        let url = format!("{BASE}/authors/{foreign_id}/works.json?limit=50");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!("OpenLibrary returned {}", resp.status())));
        }
        let body: WorksResponse = resp.json().await?;

        let books = body
            .entries
            .into_iter()
            .map(|e| {
                let description = e.description.as_ref().and_then(|d| match d {
                    serde_json::Value::String(s) => Some(s.clone()),
                    serde_json::Value::Object(o) => o.get("value").and_then(|v| v.as_str().map(String::from)),
                    _ => None,
                });
                let title_w = e.title;
                Book {
                    id: 0,
                    foreign_id: ol_id_from_key(&e.key),
                    author_id: 0,
                    title: title_w.clone(),
                    clean_title: title_w.to_lowercase(),
                    description,
                    isbn: None,
                    isbn13: None,
                    asin: None,
                    pages: None,
                    publisher: None,
                    publish_date: e.first_publish_date.as_deref().and_then(parse_date).map(|d| {
                        chrono::NaiveDate::from_ymd_opt(d.year(), 1, 1).unwrap_or(d)
                    }),
                    image_url: None,
                    genres: e.subjects.unwrap_or_default(),
                    ratings: None,
                    language: "en".into(),
                    monitored: false,
                    added_at: chrono::Utc::now(),
                    last_search_at: None,
                }
            })
            .collect();

        Ok(books)
    }

    async fn search_book(&self, query: &str) -> Result<Vec<Book>> {
        let url = format!("{BASE}/search.json?q={query}");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!("OpenLibrary returned {}", resp.status())));
        }
        let body: BookSearchResponse = resp.json().await?;

        let books = body
            .docs
            .into_iter()
            .map(|d| {
                let publish_date = d.first_publish_year.map(|y| {
                    chrono::NaiveDate::from_ymd_opt(y, 1, 1)
                        .unwrap_or_else(|| chrono::NaiveDate::from_ymd_opt(1970, 1, 1).unwrap())
                });
                let title = d.title;
                Book {
                    id: 0,
                    foreign_id: ol_id_from_key(&d.key),
                    author_id: 0,
                    title: title.clone(),
                    clean_title: title.to_lowercase(),
                    description: None,
                    isbn: d.isbn.as_ref().and_then(|i| i.first().cloned()),
                    isbn13: d.isbn.as_ref().and_then(|i| i.iter().find(|x| x.len() == 13).cloned()),
                    asin: None,
                    pages: d.number_of_pages_median,
                    publisher: d.publisher.and_then(|p| p.into_iter().next()),
                    publish_date,
                    image_url: d.cover_i.and_then(|id| cover_url(id, "M")),
                    genres: d.subject.unwrap_or_default(),
                    ratings: d.ratings_average,
                    language: d
                        .language
                        .and_then(|l| l.into_iter().next())
                        .unwrap_or_else(|| "en".into()),
                    monitored: false,
                    added_at: chrono::Utc::now(),
                    last_search_at: None,
                }
            })
            .collect();

        Ok(books)
    }

    async fn get_book(&self, foreign_id: &str) -> Result<Book> {
        let url = format!("{BASE}/works/{foreign_id}.json");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::NotFound(format!("Book {foreign_id} not found")));
        }
        let entry: WorkEntry = resp.json().await?;

        let description = entry.description.as_ref().and_then(|d| match d {
            serde_json::Value::String(s) => Some(s.clone()),
            serde_json::Value::Object(o) => o.get("value").and_then(|v| v.as_str().map(String::from)),
            _ => None,
        });

        let title = entry.title;
        Ok(Book {
            id: 0,
            foreign_id: ol_id_from_key(&entry.key),
            author_id: 0,
            title: title.clone(),
            clean_title: title.to_lowercase(),
            description,
            isbn: None,
            isbn13: None,
            asin: None,
            pages: None,
            publisher: None,
            publish_date: entry.first_publish_date.as_deref().and_then(parse_date),
            image_url: None,
            genres: entry.subjects.unwrap_or_default(),
            ratings: None,
            language: "en".into(),
            monitored: false,
            added_at: chrono::Utc::now(),
            last_search_at: None,
        })
    }

    async fn get_book_editions(&self, foreign_id: &str) -> Result<Vec<Edition>> {
        let url = format!("{BASE}/works/{foreign_id}/editions.json?limit=50");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!("OpenLibrary returned {}", resp.status())));
        }
        let body: EditionsResponse = resp.json().await?;

        let editions = body
            .entries
            .into_iter()
            .map(|e| {
                Edition {
                    id: 0,
                    book_id: 0,
                    foreign_edition_id: ol_id_from_key(&e.key),
                    isbn13: e.isbn_13.and_then(|i| i.into_iter().next()),
                    asin: None,
                    title: e.title,
                    language: "en".into(),
                    format: EditionFormat::EBook,
                    quality: None,
                    publisher: e.publishers.and_then(|p| p.into_iter().next()),
                    pages: e.number_of_pages,
                    release_date: e.publish_date.as_deref().and_then(parse_date),
                    image_url: e.cover.and_then(|c| c.large),
                    monitored: false,
                }
            })
            .collect();

        Ok(editions)
    }

    async fn get_series(&self, _foreign_id: &str) -> Result<Series> {
        Err(AppError::Other("OpenLibrary series lookup not implemented".into()))
    }
}
