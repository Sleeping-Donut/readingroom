use sqlx::SqlitePool;

use readingroom_core::error::Result;

/// Insert an author into the database. Returns the new row ID.
pub async fn insert_author(
    db: &SqlitePool,
    foreign_id: &str,
    name: &str,
) -> Result<i64> {
    let result = sqlx::query(
        "INSERT INTO authors (foreign_id, name, sort_name, monitored, added_at, updated_at)
         VALUES (?1, ?2, ?3, 1, datetime('now'), datetime('now'))",
    )
    .bind(foreign_id)
    .bind(name)
    .bind(name)
    .execute(db)
    .await?;

    Ok(result.last_insert_rowid())
}

/// List all tracked authors
pub async fn list_authors(db: &SqlitePool) -> Result<Vec<readingroom_core::models::Author>> {
    let rows = sqlx::query_as::<_, AuthorRow>(
        "SELECT id, foreign_id, name, sort_name, biography, image_url,
                birth_date, death_date, genres, aliases, links,
                monitored, added_at, tags
         FROM authors ORDER BY name"
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_domain()).collect())
}

/// Find an author by foreign_id
pub async fn find_author_by_foreign_id(
    db: &SqlitePool,
    foreign_id: &str,
) -> Result<Option<readingroom_core::models::Author>> {
    let row = sqlx::query_as::<_, AuthorRow>(
        "SELECT id, foreign_id, name, sort_name, biography, image_url,
                birth_date, death_date, genres, aliases, links,
                monitored, added_at, tags
         FROM authors WHERE foreign_id = ?1"
    )
    .bind(foreign_id)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_domain()))
}

/// Find an author by internal DB id
pub async fn get_author_by_id(
    db: &SqlitePool,
    id: i64,
) -> Result<Option<readingroom_core::models::Author>> {
    let row = sqlx::query_as::<_, AuthorRow>(
        "SELECT id, foreign_id, name, sort_name, biography, image_url,
                birth_date, death_date, genres, aliases, links,
                monitored, added_at, tags
         FROM authors WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_domain()))
}

/// Update an author's monitored flag
pub async fn update_author_monitored(
    db: &SqlitePool,
    id: i64,
    monitored: bool,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE authors SET monitored = ?1, updated_at = datetime('now') WHERE id = ?2",
    )
    .bind(monitored)
    .bind(id)
    .execute(db)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// Delete an author by id
pub async fn delete_author(db: &SqlitePool, id: i64) -> Result<bool> {
    let result = sqlx::query("DELETE FROM authors WHERE id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    Ok(result.rows_affected() > 0)
}

// ---------------------------------------------------------------------------
// Book queries
// ---------------------------------------------------------------------------

/// Insert a book. Returns the new row ID.
pub async fn insert_book(
    db: &SqlitePool,
    foreign_id: &str,
    author_id: i64,
    title: &str,
    clean_title: &str,
) -> Result<i64> {
    let result = sqlx::query(
        "INSERT INTO books (foreign_id, author_id, title, clean_title, monitored, added_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, datetime('now'), datetime('now'))",
    )
    .bind(foreign_id)
    .bind(author_id)
    .bind(title)
    .bind(clean_title)
    .execute(db)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn list_calendar_books(db: &SqlitePool) -> Result<Vec<readingroom_core::models::Book>> {
    let rows = sqlx::query_as::<_, BookRow>(
        "SELECT id, foreign_id, author_id, title, clean_title, description,
                isbn, isbn13, asin, pages, publisher, publish_date,
                image_url, genres, ratings, language, monitored,
                last_search_at, added_at
         FROM books
         WHERE publish_date IS NOT NULL
         ORDER BY publish_date DESC
         LIMIT 200",
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_domain()).collect())
}

/// List all tracked books
pub async fn list_books(db: &SqlitePool) -> Result<Vec<readingroom_core::models::Book>> {
    let rows = sqlx::query_as::<_, BookRow>(
        "SELECT b.id, b.foreign_id, b.author_id, COALESCE(a.name, '') AS author_name,
                b.title, b.clean_title, b.description,
                b.isbn, b.isbn13, b.asin, b.pages, b.publisher, b.publish_date,
                b.image_url, b.genres, b.ratings, b.language, b.monitored,
                b.last_search_at, b.added_at
         FROM books b LEFT JOIN authors a ON a.id = b.author_id ORDER BY b.title",
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_domain()).collect())
}

/// Find a book by foreign_id
pub async fn find_book_by_foreign_id(
    db: &SqlitePool,
    foreign_id: &str,
) -> Result<Option<readingroom_core::models::Book>> {
    let row = sqlx::query_as::<_, BookRow>(
        "SELECT id, foreign_id, author_id, title, clean_title, description,
                isbn, isbn13, asin, pages, publisher, publish_date,
                image_url, genres, ratings, language, monitored,
                last_search_at, added_at
         FROM books WHERE foreign_id = ?1",
    )
    .bind(foreign_id)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_domain()))
}

/// List books by author_id
pub async fn get_books_by_author(
    db: &SqlitePool,
    author_id: i64,
) -> Result<Vec<readingroom_core::models::Book>> {
    let rows = sqlx::query_as::<_, BookRow>(
        "SELECT b.id, b.foreign_id, b.author_id, COALESCE(a.name, '') AS author_name,
                b.title, b.clean_title, b.description,
                b.isbn, b.isbn13, b.asin, b.pages, b.publisher, b.publish_date,
                b.image_url, b.genres, b.ratings, b.language, b.monitored,
                b.last_search_at, b.added_at
         FROM books b LEFT JOIN authors a ON a.id = b.author_id
         WHERE b.author_id = ?1 ORDER BY b.title",
    )
    .bind(author_id)
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(|r| r.into_domain()).collect())
}

/// Get a book by internal id
pub async fn get_book_by_id(
    db: &SqlitePool,
    id: i64,
) -> Result<Option<readingroom_core::models::Book>> {
    let row = sqlx::query_as::<_, BookRow>(
        "SELECT b.id, b.foreign_id, b.author_id, COALESCE(a.name, '') AS author_name,
                b.title, b.clean_title, b.description,
                b.isbn, b.isbn13, b.asin, b.pages, b.publisher, b.publish_date,
                b.image_url, b.genres, b.ratings, b.language, b.monitored,
                b.last_search_at, b.added_at
         FROM books b LEFT JOIN authors a ON a.id = b.author_id WHERE b.id = ?1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| r.into_domain()))
}

/// Persist metadata (cover, description, publish date, etc.) fetched from an
/// external source back into the books table so it's available elsewhere in
/// the UI without repeated lookups.
pub async fn update_book_metadata(
    db: &SqlitePool,
    b: &readingroom_core::models::Book,
) -> Result<bool> {
    let genres = serde_json::to_string(&b.genres).unwrap_or_else(|_| "[]".into());
    let result = sqlx::query(
        "UPDATE books SET description = ?1, isbn = ?2, isbn13 = ?3, pages = ?4,
         publisher = ?5, publish_date = ?6, image_url = ?7, genres = ?8,
         ratings = ?9, language = ?10 WHERE id = ?11",
    )
    .bind(&b.description)
    .bind(&b.isbn)
    .bind(&b.isbn13)
    .bind(b.pages)
    .bind(&b.publisher)
    .bind(b.publish_date.map(|d| d.to_string()))
    .bind(&b.image_url)
    .bind(&genres)
    .bind(b.ratings)
    .bind(&b.language)
    .bind(b.id)
    .execute(db)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// Fetch just the title for a book (avoids loading the full Book struct)
pub async fn get_book_title(
    db: &SqlitePool,
    id: i64,
) -> Result<Option<String>> {
    let title: Option<String> = sqlx::query_scalar(
        "SELECT title FROM books WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?;
    Ok(title)
}

/// Update a book's monitored flag
pub async fn update_book_monitored(
    db: &SqlitePool,
    id: i64,
    monitored: bool,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE books SET monitored = ?1, updated_at = datetime('now') WHERE id = ?2",
    )
    .bind(monitored)
    .bind(id)
    .execute(db)
    .await?;

    Ok(result.rows_affected() > 0)
}

/// Delete a book by id
pub async fn delete_book(db: &SqlitePool, id: i64) -> Result<bool> {
    let result = sqlx::query("DELETE FROM books WHERE id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    Ok(result.rows_affected() > 0)
}

// ---------------------------------------------------------------------------
// Queue queries
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct QueueEntry {
    pub id: i64,
    pub book_id: Option<i64>,
    pub edition_id: Option<i64>,
    pub download_id: String,
    pub download_client: String,
    pub title: String,
    pub size: Option<i64>,
    pub status: String,
    pub progress: f64,
    pub added_at: String,
    pub completed_at: Option<String>,
}

impl QueueEntry {
    pub fn status_enum(&self) -> readingroom_core::models::QueueStatus {
        readingroom_core::models::QueueStatus::from_str(&self.status)
    }

    pub fn into_active(self) -> Option<readingroom_core::models::ActiveDownload> {
        let book_id = self.book_id?;
        Some(readingroom_core::models::ActiveDownload {
            id: self.id,
            book_id,
            download_id: self.download_id,
            download_client: self.download_client,
            title: self.title,
            size: self.size.unwrap_or(0),
            progress: self.progress,
        })
    }
}

pub async fn insert_queue_entry(
    db: &SqlitePool,
    book_id: i64,
    edition_id: Option<i64>,
    download_id: &str,
    download_client: &str,
    title: &str,
    size: i64,
) -> Result<i64> {
    let result = sqlx::query(
        "INSERT INTO queue (book_id, edition_id, download_id, download_client, title, size, status, progress, added_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'downloading', 0.0, datetime('now'))",
    )
    .bind(book_id)
    .bind(edition_id)
    .bind(download_id)
    .bind(download_client)
    .bind(title)
    .bind(size)
    .execute(db)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn list_queue(db: &SqlitePool) -> Result<Vec<QueueEntry>> {
    let rows = sqlx::query_as::<_, QueueEntry>(
        "SELECT id, book_id, edition_id, download_id, download_client, title, size,
                status, progress, added_at, completed_at
         FROM queue ORDER BY added_at DESC",
    )
    .fetch_all(db)
    .await?;

    Ok(rows)
}

pub async fn list_active_queue(db: &SqlitePool) -> Result<Vec<QueueEntry>> {
    let rows = sqlx::query_as::<_, QueueEntry>(
        "SELECT id, book_id, edition_id, download_id, download_client, title, size,
                status, progress, added_at, completed_at
         FROM queue WHERE status IN ('queued', 'downloading', 'seeding')
         ORDER BY added_at DESC",
    )
    .fetch_all(db)
    .await?;

    Ok(rows)
}

pub async fn get_queue_entry(db: &SqlitePool, id: i64) -> Result<Option<QueueEntry>> {
    let row = sqlx::query_as::<_, QueueEntry>(
        "SELECT id, book_id, edition_id, download_id, download_client, title, size,
                status, progress, added_at, completed_at
         FROM queue WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(row)
}

pub async fn update_queue_status(
    db: &SqlitePool,
    id: i64,
    status: &str,
    progress: f64,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE queue SET status = ?1, progress = ?2 WHERE id = ?3",
    )
    .bind(status)
    .bind(progress)
    .bind(id)
    .execute(db)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn update_queue_status_typed(
    db: &SqlitePool,
    id: i64,
    status: readingroom_core::models::QueueStatus,
    progress: f64,
) -> Result<bool> {
    update_queue_status(db, id, status.as_str(), progress).await
}

pub async fn complete_queue_entry(db: &SqlitePool, id: i64) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE queue SET status = 'completed', progress = 1.0, completed_at = datetime('now') WHERE id = ?1",
    )
    .bind(id)
    .execute(db)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn update_queue_status_to(
    db: &SqlitePool,
    id: i64,
    status: readingroom_core::models::QueueStatus,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE queue SET status = ?1, progress = CASE WHEN ?1 IN ('completed','imported','failed','removed') THEN 1.0 ELSE progress END, completed_at = CASE WHEN ?1 IN ('completed','imported','failed','removed') THEN datetime('now') ELSE completed_at END WHERE id = ?2",
    )
    .bind(status.as_str())
    .bind(id)
    .execute(db)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn delete_queue_entry(db: &SqlitePool, id: i64) -> Result<bool> {
    let result = sqlx::query("DELETE FROM queue WHERE id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    Ok(result.rows_affected() > 0)
}

// ---------------------------------------------------------------------------
// Edition, BookFile, and History queries
// ---------------------------------------------------------------------------

pub async fn insert_edition(
    db: &SqlitePool,
    book_id: i64,
    foreign_edition_id: &str,
    title: &str,
    language: &str,
    format: &str,
    quality: &readingroom_core::models::Quality,
) -> Result<i64> {
    let quality_str = format!("{:?}", quality);
    let result = sqlx::query(
        "INSERT INTO editions (book_id, foreign_edition_id, title, language, format, quality, monitored, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, datetime('now'))",
    )
    .bind(book_id)
    .bind(foreign_edition_id)
    .bind(title)
    .bind(language)
    .bind(format)
    .bind(&quality_str)
    .execute(db)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn insert_book_file(
    db: &SqlitePool,
    edition_id: i64,
    path: &str,
    size: i64,
    quality: &str,
    format: &str,
) -> Result<i64> {
    let result = sqlx::query(
        "INSERT INTO book_files (edition_id, path, size, quality, format, date_added)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
    )
    .bind(edition_id)
    .bind(path)
    .bind(size)
    .bind(quality)
    .bind(format)
    .execute(db)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn insert_history(
    db: &SqlitePool,
    event_type: &str,
    source_title: &str,
    book_id: Option<i64>,
    queue_id: i64,
) -> Result<i64> {
    let result = sqlx::query(
        "INSERT INTO history (event_type, source_title, book_id, data, date)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))",
    )
    .bind(event_type)
    .bind(source_title)
    .bind(book_id)
    .bind(format!("{{\"queue_id\":{queue_id}}}"))
    .execute(db)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn list_history(
    db: &SqlitePool,
    limit: i64,
) -> Result<Vec<HistoryRow>> {
    let rows = sqlx::query_as::<_, HistoryRow>(
        "SELECT id, event_type, source_title, book_id, indexer, download_client,
                download_id, quality, size, data, date
         FROM history ORDER BY date DESC LIMIT ?1",
    )
    .bind(limit)
    .fetch_all(db)
    .await?;

    Ok(rows)
}

pub async fn list_wanted_books(db: &SqlitePool) -> Result<Vec<readingroom_core::models::Book>> {
    let rows = sqlx::query_as::<_, BookRow>(
        "SELECT b.id, b.foreign_id, b.author_id, b.title, b.clean_title, b.description,
                b.isbn, b.isbn13, b.asin, b.pages, b.publisher, b.publish_date,
                b.image_url, b.genres, b.ratings, b.language, b.monitored,
                b.last_search_at, b.added_at
         FROM books b
         WHERE b.monitored = 1
         AND NOT EXISTS (
             SELECT 1 FROM book_files bf
             JOIN editions e ON bf.edition_id = e.id
             WHERE e.book_id = b.id
         )
         ORDER BY b.title"
    )
    .fetch_all(db)
    .await?;
    Ok(rows.into_iter().map(|r| r.into_domain()).collect())
}

// ---------------------------------------------------------------------------
// Row types for sqlx query_as
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct AuthorRow {
    id: i64,
    foreign_id: String,
    name: String,
    sort_name: Option<String>,
    biography: Option<String>,
    image_url: Option<String>,
    birth_date: Option<String>,
    death_date: Option<String>,
    genres: String,      // JSON array stored as TEXT
    aliases: String,     // JSON array stored as TEXT
    links: String,       // JSON array stored as TEXT
    monitored: bool,
    added_at: String,    // ISO datetime string
    tags: String,        // JSON array stored as TEXT
}

#[derive(sqlx::FromRow)]
struct BookRow {
    id: i64,
    foreign_id: String,
    author_id: i64,
    author_name: String,
    title: String,
    clean_title: String,
    description: Option<String>,
    isbn: Option<String>,
    isbn13: Option<String>,
    asin: Option<String>,
    pages: Option<i32>,
    publisher: Option<String>,
    publish_date: Option<String>,
    image_url: Option<String>,
    genres: String,       // JSON array stored as TEXT
    ratings: Option<f64>,
    language: String,
    monitored: bool,
    last_search_at: Option<String>, // ISO datetime string
    added_at: String,     // ISO datetime string
}

impl BookRow {
    fn into_domain(self) -> readingroom_core::models::Book {
        let parse_date = |s: Option<String>| {
            s.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        };
        let parse_dt = |s: String| {
            chrono::DateTime::parse_from_rfc3339(&s)
                .map(|d| d.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now())
        };
        let parse_genres = |s: String| -> Vec<String> {
            serde_json::from_str(&s).unwrap_or_default()
        };

        readingroom_core::models::Book {
            id: self.id,
            foreign_id: self.foreign_id,
            author_id: self.author_id,
            author_name: (!self.author_name.is_empty()).then_some(self.author_name),
            title: self.title,
            clean_title: self.clean_title,
            description: self.description,
            isbn: self.isbn,
            isbn13: self.isbn13,
            asin: self.asin,
            pages: self.pages,
            publisher: self.publisher,
            publish_date: parse_date(self.publish_date),
            image_url: self.image_url,
            genres: parse_genres(self.genres),
            ratings: self.ratings,
            language: self.language,
            monitored: self.monitored,
            added_at: parse_dt(self.added_at),
            last_search_at: self
                .last_search_at
                .map(|s| parse_dt(s)),
        }
    }
}

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct HistoryRow {
    pub id: i64,
    pub event_type: String,
    pub source_title: Option<String>,
    pub book_id: Option<i64>,
    pub indexer: Option<String>,
    pub download_client: Option<String>,
    pub download_id: Option<String>,
    pub quality: Option<String>,
    pub size: Option<i64>,
    pub data: Option<String>,
    pub date: String,
}

impl AuthorRow {
    fn into_domain(self) -> readingroom_core::models::Author {
        let parse_date = |s: Option<String>| {
            s.and_then(|d| chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
        };
        let parse_json_vec = |s: String| -> Vec<String> {
            serde_json::from_str(&s).unwrap_or_default()
        };

        readingroom_core::models::Author {
            id: self.id,
            foreign_id: self.foreign_id,
            name: self.name,
            sort_name: self.sort_name,
            biography: self.biography,
            image_url: self.image_url,
            birth_date: parse_date(self.birth_date),
            death_date: parse_date(self.death_date),
            genres: parse_json_vec(self.genres),
            aliases: parse_json_vec(self.aliases),
            links: serde_json::from_str(&self.links).unwrap_or_default(),
            monitored: self.monitored,
            added_at: chrono::DateTime::parse_from_rfc3339(&self.added_at)
                .map(|d| d.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now()),
            tags: parse_json_vec(self.tags)
                .into_iter()
                .filter_map(|t| t.parse().ok())
                .collect(),
        }
    }
}
