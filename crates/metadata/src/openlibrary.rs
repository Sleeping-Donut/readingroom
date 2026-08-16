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

    /// Resolve an author name for a work. Some work payloads carry the name
    /// directly on the author entry; OpenLibrary usually only exposes the
    /// author key, so fall back to fetching the author record.
    async fn resolve_work_author_name(&self, entry: &WorkEntry) -> Option<String> {
        if let Some(name) = author_name_from_work(entry) {
            return Some(name);
        }
        let author_key = entry.authors.as_ref()?.first()?.author.as_ref()?.key.as_str();
        let stripped = author_key.trim_start_matches('/');
        let ol_key = stripped.strip_prefix("authors/").unwrap_or(stripped);
        let url = format!("{BASE}/authors/{ol_key}.json");
        let resp = self.client.get(&url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let details: AuthorDetails = resp.json().await.ok()?;
        Some(details.name)
    }

    /// Resolve a book from a bare ISBN. OpenLibrary exposes a dedicated
    /// `/isbn/{isbn}.json` endpoint returning an edition record; when the
    /// edition links a work, the work-based `get_book` does the heavy lifting
    /// and the edition's own details (title, cover, pages, publish date, ISBN)
    /// are mapped over the result so they take precedence.
    async fn get_book_by_isbn(&self, isbn: &str) -> Result<Book> {
        let normalized: String = isbn.chars().filter(|c| *c != '-' && *c != ' ').collect();
        let url = format!("{BASE}/isbn/{normalized}.json");
        let resp = self.client.get(&url).send().await?;
        if resp.status().as_u16() == 404 {
            return Err(AppError::NotFound(format!("Book {isbn} not found")));
        }
        if !resp.status().is_success() {
            return Err(AppError::Provider(format!("OpenLibrary returned {}", resp.status())));
        }
        let edition: EditionDetails = resp.json().await?;

        let mut book = if let Some(work_key) = edition
            .works
            .as_ref()
            .and_then(|w| w.first())
            .map(|w| w.key.trim_start_matches('/').to_string())
        {
            self.get_book(&work_key).await?
        } else {
            let title = edition.title.clone().unwrap_or_default();
            Book {
                id: 0,
                foreign_id: edition
                    .key
                    .as_deref()
                    .map(ol_id_from_key)
                    .unwrap_or_else(|| format!("isbn:{normalized}")),
                author_id: 0,
                author_name: None,
                title: title.clone(),
                clean_title: title.to_lowercase(),
                description: None,
                isbn: None,
                isbn13: None,
                asin: None,
                pages: edition.number_of_pages,
                publisher: edition.publishers.as_ref().and_then(|p| p.first().cloned()),
                publish_date: edition.publish_date.as_deref().and_then(parse_date),
                image_url: edition
                    .covers
                    .as_ref()
                    .and_then(|c| c.first().copied())
                    .and_then(|id| cover_url(id, "L")),
                genres: vec![],
                ratings: None,
                language: "en".into(),
                monitored: false,
                status: "tracked".into(),
                added_at: chrono::Utc::now(),
                last_search_at: None,
            }
        };

        // Prefer the edition's own details over the work's when present.
        if let Some(title) = edition.title {
            book.title = title;
            book.clean_title = book.title.to_lowercase();
        }
        if let Some(cover_id) = edition.covers.as_ref().and_then(|c| c.first().copied()) {
            if let Some(url) = cover_url(cover_id, "L") {
                book.image_url = Some(url);
            }
        }
        if let Some(pages) = edition.number_of_pages {
            book.pages = Some(pages);
        }
        if let Some(date) = edition.publish_date.as_deref().and_then(parse_date) {
            book.publish_date = Some(date);
        }
        if let Some(publisher) = edition.publishers.as_ref().and_then(|p| p.first().cloned()) {
            book.publisher = Some(publisher);
        }
        if let Some(isbn13) = edition.isbn_13.as_ref().and_then(|i| i.first().cloned()) {
            book.isbn13 = Some(isbn13);
        }
        if let Some(isbn10) = edition.isbn_10.as_ref().and_then(|i| i.first().cloned()) {
            book.isbn = Some(isbn10);
        }

        Ok(book)
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
    covers: Option<Vec<i64>>,
    authors: Option<Vec<WorkAuthor>>,
}

#[derive(serde::Deserialize)]
struct WorkAuthor {
    name: Option<String>,
    author: Option<WorkAuthorRef>,
}

#[derive(serde::Deserialize)]
struct WorkAuthorRef {
    key: String,
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

/// A single edition record returned by `GET /isbn/{isbn}.json`. Carries the
/// linked work key so an ISBN can be resolved onto the work-based `get_book`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditionDetails {
    key: Option<String>,
    title: Option<String>,
    works: Option<Vec<EditionWorkRef>>,
    covers: Option<Vec<i64>>,
    publishers: Option<Vec<String>>,
    publish_date: Option<String>,
    number_of_pages: Option<i32>,
    isbn_13: Option<Vec<String>>,
    isbn_10: Option<Vec<String>>,
}

#[derive(serde::Deserialize)]
struct EditionWorkRef {
    key: String,
}

fn ol_id_from_key(key: &str) -> String {
    key.trim_start_matches('/').to_string()
}

/// Whether a route id is a bare ISBN (10- or 13-digit, with hyphens/spaces
/// allowed) rather than an OpenLibrary works/books key. An isbn10 may end in
/// an `X`/`x` check digit, which is preserved.
fn looks_like_isbn(s: &str) -> bool {
    let digits: String = s.chars().filter(|c| *c != '-' && *c != ' ').collect();
    if digits.len() == 13 {
        digits.chars().all(|c| c.is_ascii_digit())
    } else if digits.len() == 10 {
        digits.chars().take(9).all(|c| c.is_ascii_digit())
            && digits
                .chars()
                .last()
                .map(|c| c.is_ascii_digit() || c == 'X' || c == 'x')
                .unwrap_or(false)
    } else {
        false
    }
}

fn cover_url(cover_id: i64, size: &str) -> Option<String> {
    Some(format!("https://covers.openlibrary.org/b/id/{cover_id}-{size}.jpg"))
}

fn author_name_from_work(entry: &WorkEntry) -> Option<String> {
    entry
        .authors
        .as_ref()
        .and_then(|authors| authors.iter().find_map(|a| a.name.clone()))
}fn parse_date(s: &str) -> Option<chrono::NaiveDate> {
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
        let ol_key = foreign_id
            .strip_prefix("authors/")
            .or_else(|| foreign_id.strip_prefix('/'))
            .unwrap_or(foreign_id);
        let url = format!("{BASE}/authors/{ol_key}.json");
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
                let author_name = author_name_from_work(&e);
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
                    author_name,
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
                    status: "tracked".into(),
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
                    author_name: d.author_name.and_then(|a| a.into_iter().next()),
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
                    status: "tracked".into(),
                    added_at: chrono::Utc::now(),
                    last_search_at: None,
                }
            })
            .collect();

        Ok(books)
    }

    async fn get_book(&self, foreign_id: &str) -> Result<Book> {
        // A bare ISBN resolves through the edition record first; when the
        // edition links a work, the work-based path below does the heavy
        // lifting and this edition's details are mapped over it.
        if looks_like_isbn(foreign_id) {
            return self.get_book_by_isbn(foreign_id).await;
        }

        // Normalize the key: search results use "works/OL123W"/"books/OL456M"
        // while the DB may hold bare "OL123W"/"OL456M" keys.
        let (kind, key) = if let Some(k) = foreign_id.strip_prefix("works/") {
            ("works", k)
        } else if let Some(k) = foreign_id.strip_prefix("books/") {
            ("books", k)
        } else if foreign_id.ends_with('W') {
            ("works", foreign_id)
        } else {
            ("books", foreign_id)
        };
        let url = format!("{BASE}/{kind}/{key}.json");
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::NotFound(format!("Book {foreign_id} not found")));
        }
        let entry: WorkEntry = resp.json().await?;

        let author_name = self.resolve_work_author_name(&entry).await;

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
            author_name,
            title: title.clone(),
            clean_title: title.to_lowercase(),
            description,
            isbn: None,
            isbn13: None,
            asin: None,
            pages: None,
            publisher: None,
            publish_date: entry.first_publish_date.as_deref().and_then(parse_date),
            image_url: entry
                .covers
                .and_then(|c| c.first().copied())
                .and_then(|id| cover_url(id, "L")),
            genres: entry.subjects.unwrap_or_default(),
            ratings: None,
            language: "en".into(),
            monitored: false,
            status: "tracked".into(),
            added_at: chrono::Utc::now(),
            last_search_at: None,
        })
    }

    async fn get_book_editions(&self, foreign_id: &str) -> Result<Vec<Edition>> {
        // Normalize the key: the same prefixes `get_book` understands
        // ("works/OL123W", "books/OL456M", or bare keys) may be passed in.
        let key = foreign_id
            .strip_prefix("works/")
            .or_else(|| foreign_id.strip_prefix("books/"))
            .unwrap_or(foreign_id);
        let url = format!("{BASE}/works/{key}/editions.json?limit=50");
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

#[cfg(test)]
mod tests {
    use super::looks_like_isbn;

    #[test]
    fn isbn_detection_accepts_isbn10_and_isbn13() {
        assert!(looks_like_isbn("9780553382570"));
        assert!(looks_like_isbn("978-0-553-38257-0"));
        assert!(looks_like_isbn("978 0 553 38257 0"));
        assert!(looks_like_isbn("055338257X"));
        assert!(looks_like_isbn("055338257x"));
        assert!(looks_like_isbn("0-553-38257-X"));
    }

    #[test]
    fn isbn_detection_rejects_non_isbns() {
        assert!(!looks_like_isbn("OL123W"));
        assert!(!looks_like_isbn("works/OL123W"));
        assert!(!looks_like_isbn("books/OL456M"));
        assert!(!looks_like_isbn("123"));
        assert!(!looks_like_isbn("B00ABC123"));
        assert!(!looks_like_isbn(""));
    }
}
