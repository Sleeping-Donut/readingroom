use async_trait::async_trait;
use chrono::{Datelike, NaiveDate, Utc};
use futures_util::StreamExt;
use readingroom_core::{
    error::{AppError, Result},
    models::*,
    traits::MetadataSource,
};
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::io::AsyncWriteExt;

pub const DEFAULT_DUMP_URL: &str = "https://openlibrary.org/data/ol_dump_all_latest.txt.gz";

#[derive(Debug, Clone, PartialEq)]
pub enum ImportState {
    Idle,
    Downloading,
    Importing,
    Done,
    Failed(String),
}

impl serde::Serialize for ImportState {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        match self {
            ImportState::Idle => serializer.serialize_str("Idle"),
            ImportState::Downloading => serializer.serialize_str("Downloading"),
            ImportState::Importing => serializer.serialize_str("Importing"),
            ImportState::Done => serializer.serialize_str("Done"),
            ImportState::Failed(msg) => serializer.serialize_str(&format!("Failed: {msg}")),
        }
    }
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct ImportCounts {
    pub works: u64,
    pub editions: u64,
    pub authors: u64,
    pub redirects: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportProgress {
    pub state: ImportState,
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    /// Compressed bytes consumed during the import phase (of the same file),
    /// so the UI can show a real percentage while parsing rows.
    pub import_bytes: u64,
    pub rows: u64,
    pub counts: ImportCounts,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Thread-safe handle for the import progress; shared between the background
/// import task and the status endpoint.
#[derive(Clone)]
pub struct ImportHandle {
    inner: Arc<Mutex<ImportProgress>>,
}

impl ImportHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(ImportProgress {
                state: ImportState::Idle,
                bytes_downloaded: 0,
                total_bytes: None,
                import_bytes: 0,
                rows: 0,
                counts: ImportCounts::default(),
                started_at: None,
            })),
        }
    }

    pub fn snapshot(&self) -> ImportProgress {
        self.inner.lock().map(|p| p.clone()).unwrap_or_else(|_| {
            ImportProgress {
                state: ImportState::Idle,
                bytes_downloaded: 0,
                total_bytes: None,
                import_bytes: 0,
                rows: 0,
                counts: ImportCounts::default(),
                started_at: None,
            }
        })
    }

    fn set(&self, f: impl FnOnce(&mut ImportProgress)) {
        if let Ok(mut p) = self.inner.lock() {
            f(&mut p);
        }
    }
}

/// Persisted result of the last import attempt, so status survives restarts.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct CacheMeta {
    pub imported_at: Option<String>,
    pub last_status: Option<String>,
    pub last_error: Option<String>,
    pub last_attempt: Option<String>,
}

/// SQLite-backed read-only metadata source over an imported dump.
#[derive(Clone)]
pub struct OlCacheSource {
    db: sqlx::SqlitePool,
}

impl OlCacheSource {
    /// Connect (or create) the cache DB at `path` and ensure the schema exists.
    pub async fn open(path: &Path) -> Result<Self> {
        let options = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(options)
            .await?;
        ensure_schema(&pool).await?;
        Ok(Self { db: pool })
    }

    /// The underlying pool, used by the importer.
    pub fn pool(&self) -> &sqlx::SqlitePool {
        &self.db
    }

    async fn meta_value(&self, key: &str) -> Option<String> {
        sqlx::query_scalar("SELECT value FROM meta WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.db)
            .await
            .ok()
            .flatten()
    }

    /// Row counts + persisted result of the last import attempt.
    pub async fn stats(&self) -> Result<(ImportCounts, CacheMeta)> {
        let counts = ImportCounts {
            works: count_rows(&self.db, "works").await?,
            editions: count_rows(&self.db, "editions").await?,
            authors: count_rows(&self.db, "authors").await?,
            redirects: count_rows(&self.db, "redirects").await?,
        };
        let meta = CacheMeta {
            imported_at: self.meta_value("dump_imported_at").await,
            last_status: self.meta_value("dump_last_status").await,
            last_error: self.meta_value("dump_last_error").await,
            last_attempt: self.meta_value("dump_last_attempt").await,
        };
        Ok((counts, meta))
    }
}

// ---------------------------------------------------------------------------
// Dump record shapes
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize, Default)]
#[allow(dead_code)]
struct DumpWork {
    key: String,
    #[serde(default)]
    title: String,
    subtitle: Option<String>,
    first_publish_date: Option<String>,
    description: Option<serde_json::Value>,
    #[serde(default)]
    subjects: Vec<String>,
    #[serde(default)]
    covers: Vec<i64>,
    #[serde(default)]
    authors: Vec<DumpWorkAuthor>,
    #[serde(default)]
    languages: Vec<DumpKeyRef>,
}

#[derive(serde::Deserialize)]
struct DumpWorkAuthor {
    author: Option<DumpKeyRef>,
}

#[derive(serde::Deserialize)]
struct DumpKeyRef {
    key: String,
}

#[derive(serde::Deserialize, Default)]
#[allow(dead_code)]
struct DumpEdition {
    key: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    works: Vec<DumpKeyRef>,
    #[serde(default)]
    isbn_13: Vec<String>,
    #[serde(default)]
    isbn_10: Vec<String>,
    #[serde(default)]
    publishers: Vec<String>,
    publish_date: Option<String>,
    number_of_pages: Option<i32>,
    #[serde(default)]
    covers: Vec<i64>,
    #[serde(default)]
    languages: Vec<DumpKeyRef>,
}

#[derive(serde::Deserialize, Default)]
struct DumpAuthor {
    key: String,
    #[serde(default)]
    name: String,
    birth_date: Option<String>,
    death_date: Option<String>,
    bio: Option<serde_json::Value>,
    #[serde(default)]
    photos: Vec<i64>,
    #[serde(default)]
    links: Vec<DumpAuthorLink>,
    #[serde(default)]
    alternate_names: Vec<String>,
}

#[derive(serde::Deserialize)]
struct DumpAuthorLink {
    url: String,
    title: Option<String>,
}

#[derive(serde::Deserialize)]
struct DumpRedirect {
    key: String,
    location: Option<String>,
    #[serde(rename = "to")]
    to: Option<String>,
}

// ---------------------------------------------------------------------------
// Import pipeline
// ---------------------------------------------------------------------------

struct WorkRow {
    key: String,
    title: String,
    author_keys: String,
    first_publish_date: Option<String>,
    json: String,
}

struct EditionRow {
    key: String,
    work_key: Option<String>,
    title: String,
    isbn: String,
    json: String,
}

struct AuthorRow {
    key: String,
    name: String,
    json: String,
}

struct ImportBatch {
    works: Vec<WorkRow>,
    editions: Vec<EditionRow>,
    authors: Vec<AuthorRow>,
    redirects: Vec<(String, String)>,
}

enum Batch {
    Data(ImportBatch),
    /// Compressed bytes consumed so far during the import phase.
    Progress(u64),
    Done,
}

const SCHEMA_STATEMENTS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS works (key TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', author_keys TEXT NOT NULL DEFAULT '[]', first_publish_date TEXT, json TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_works_title ON works(title)",
    "CREATE TABLE IF NOT EXISTS editions (key TEXT PRIMARY KEY, work_key TEXT, title TEXT NOT NULL DEFAULT '', isbn TEXT NOT NULL DEFAULT '', json TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_editions_work ON editions(work_key)",
    "CREATE INDEX IF NOT EXISTS idx_editions_isbn ON editions(isbn)",
    "CREATE TABLE IF NOT EXISTS authors (key TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', json TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_authors_name ON authors(name)",
    "CREATE TABLE IF NOT EXISTS redirects (key TEXT PRIMARY KEY, to_key TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

async fn ensure_schema(db: &sqlx::SqlitePool) -> Result<()> {
    sqlx::query("PRAGMA journal_mode=WAL").execute(db).await?;
    for stmt in SCHEMA_STATEMENTS {
        sqlx::query(stmt).execute(db).await?;
    }
    Ok(())
}

async fn count_rows(db: &sqlx::SqlitePool, table: &str) -> Result<u64> {
    let q = format!("SELECT COUNT(*) FROM {table}");
    let n: i64 = sqlx::query_scalar(&q).fetch_one(db).await?;
    Ok(n as u64)
}

/// Derive the temp download path from the connected DB file, falling back to a
/// temp-dir path for in-memory pools.
async fn dump_tmp_path(db: &sqlx::SqlitePool) -> Result<PathBuf> {
    let rows: Vec<(i64, String, String)> =
        sqlx::query_as("PRAGMA database_list").fetch_all(db).await?;
    let file = rows
        .into_iter()
        .find(|r| r.1 == "main")
        .map(|r| r.2)
        .unwrap_or_default();
    if file.is_empty() {
        Ok(std::env::temp_dir().join(format!("ol_dump_{}.dump.gz.tmp", std::process::id())))
    } else {
        Ok(PathBuf::from(file).with_extension("dump.gz.tmp"))
    }
}

/// Download the gzip dump from `url` and stream-import it into `db`. Updates
/// `handle` throughout. Returns final counts. Idempotent per invocation
/// (tables are REPLACE'd); intended to run in a spawned background task.
pub async fn download_and_import(
    db: &sqlx::SqlitePool,
    url: &str,
    handle: &ImportHandle,
) -> Result<ImportCounts> {
    let started = Utc::now();
    handle.set(|p| {
        p.state = ImportState::Downloading;
        p.started_at = Some(started);
        p.bytes_downloaded = 0;
        p.total_bytes = None;
        p.import_bytes = 0;
        p.rows = 0;
        p.counts = ImportCounts::default();
    });

    let tmp = dump_tmp_path(db).await?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()?;

    let result = async {
        download_to_file(&client, url, &tmp, handle).await?;
        handle.set(|p| p.state = ImportState::Importing);

        sqlx::query("PRAGMA synchronous=OFF").execute(db).await?;
        sqlx::query("PRAGMA cache_size=-200000").execute(db).await?;
        sqlx::query("PRAGMA temp_store=MEMORY").execute(db).await?;

        let counts = import_dump_file(db, &tmp, handle).await?;

        let _ = tokio::fs::remove_file(&tmp).await;
        let now = Utc::now().to_rfc3339();
        let writes: [(&str, String); 5] = [
            ("dump_imported_at", now.clone()),
            ("dump_source", url.to_string()),
            ("dump_last_status", "success".to_string()),
            ("dump_last_error", String::new()),
            ("dump_last_attempt", now),
        ];
        for (key, value) in writes {
            sqlx::query("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)")
                .bind(key)
                .bind(value)
                .execute(db)
                .await?;
        }
        Ok::<_, AppError>(counts)
    }
    .await;

    match result {
        Ok(counts) => {
            handle.set(|p| p.state = ImportState::Done);
            Ok(counts)
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&tmp).await;
            let now = Utc::now().to_rfc3339();
            let _ = sqlx::query("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)")
                .bind("dump_last_status")
                .bind("failed")
                .execute(db)
                .await;
            let _ = sqlx::query("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)")
                .bind("dump_last_error")
                .bind(e.to_string())
                .execute(db)
                .await;
            let _ = sqlx::query("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)")
                .bind("dump_last_attempt")
                .bind(now)
                .execute(db)
                .await;
            handle.set(|p| p.state = ImportState::Failed(e.to_string()));
            Err(e)
        }
    }
}

async fn download_to_file(
    client: &reqwest::Client,
    url: &str,
    path: &Path,
    handle: &ImportHandle,
) -> Result<()> {
    let total_bytes = match client.head(url).send().await {
        Ok(resp) => resp.content_length(),
        Err(_) => None,
    };
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::Other(format!("dump download returned {}", resp.status())));
    }
    let total_bytes = total_bytes.or_else(|| resp.content_length());
    handle.set(|p| p.total_bytes = total_bytes);

    let mut file = tokio::fs::File::create(path).await?;
    let mut stream = resp.bytes_stream();
    let mut downloaded = 0u64;
    let mut since_update = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        since_update += chunk.len() as u64;
        if since_update >= (1 << 20) {
            handle.set(|p| p.bytes_downloaded = downloaded);
            since_update = 0;
        }
    }
    file.flush().await?;
    handle.set(|p| p.bytes_downloaded = downloaded);
    Ok(())
}

async fn import_dump_file(
    db: &sqlx::SqlitePool,
    path: &Path,
    handle: &ImportHandle,
) -> Result<ImportCounts> {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Batch>(64);

    let path_owned = path.to_path_buf();
    let parser = {
        let tx = tx.clone();
        tokio::task::spawn_blocking(move || -> std::io::Result<()> {
            let res = parse_dump(&path_owned, &tx);
            let _ = tx.send(Batch::Done);
            res
        })
    };
    drop(tx);

    let mut counts = ImportCounts::default();
    let mut rows_since_commit = 0u64;
    let mut txn: Option<sqlx::Transaction<'_, sqlx::Sqlite>> = None;

    while let Some(batch) = rx.recv().await {
        match batch {
            Batch::Done => break,
            Batch::Progress(bytes) => {
                handle.set(|p| p.import_bytes = bytes);
            }
            Batch::Data(b) => {
                if txn.is_none() {
                    txn = Some(db.begin().await?);
                }
                let inserted = insert_rows(txn.as_mut().unwrap(), &b).await?;
                counts.works += b.works.len() as u64;
                counts.editions += b.editions.len() as u64;
                counts.authors += b.authors.len() as u64;
                counts.redirects += b.redirects.len() as u64;
                rows_since_commit += inserted as u64;
                handle.set(|p| {
                    p.rows += inserted as u64;
                    p.counts = counts.clone();
                });
                if rows_since_commit >= 5000 {
                    txn.take().unwrap().commit().await?;
                    rows_since_commit = 0;
                }
            }
        }
    }

    if let Some(t) = txn.take() {
        t.commit().await?;
    }

    let parse_result = parser
        .await
        .map_err(|e| AppError::Other(format!("dump parse task panicked: {e}")))?;
    parse_result?;
    Ok(counts)
}

async fn insert_rows(
    txn: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    batch: &ImportBatch,
) -> Result<usize> {
    let mut n = 0;
    for row in &batch.works {
        sqlx::query("INSERT OR REPLACE INTO works (key, title, author_keys, first_publish_date, json) VALUES (?, ?, ?, ?, ?)")
            .bind(&row.key)
            .bind(&row.title)
            .bind(&row.author_keys)
            .bind(&row.first_publish_date)
            .bind(&row.json)
            .execute(&mut **txn)
            .await?;
        n += 1;
    }
    for row in &batch.editions {
        sqlx::query("INSERT OR REPLACE INTO editions (key, work_key, title, isbn, json) VALUES (?, ?, ?, ?, ?)")
            .bind(&row.key)
            .bind(&row.work_key)
            .bind(&row.title)
            .bind(&row.isbn)
            .bind(&row.json)
            .execute(&mut **txn)
            .await?;
        n += 1;
    }
    for row in &batch.authors {
        sqlx::query("INSERT OR REPLACE INTO authors (key, name, json) VALUES (?, ?, ?)")
            .bind(&row.key)
            .bind(&row.name)
            .bind(&row.json)
            .execute(&mut **txn)
            .await?;
        n += 1;
    }
    for (key, to_key) in &batch.redirects {
        sqlx::query("INSERT OR REPLACE INTO redirects (key, to_key) VALUES (?, ?)")
            .bind(key)
            .bind(to_key)
            .execute(&mut **txn)
            .await?;
        n += 1;
    }
    Ok(n)
}

fn send_batch(tx: &tokio::sync::mpsc::Sender<Batch>, batch: &mut ImportBatch) -> std::io::Result<()> {
    if batch.works.is_empty()
        && batch.editions.is_empty()
        && batch.authors.is_empty()
        && batch.redirects.is_empty()
    {
        return Ok(());
    }
    let b = Batch::Data(ImportBatch {
        works: std::mem::take(&mut batch.works),
        editions: std::mem::take(&mut batch.editions),
        authors: std::mem::take(&mut batch.authors),
        redirects: std::mem::take(&mut batch.redirects),
    });
    tx.blocking_send(b)
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::BrokenPipe, "import channel closed"))?;
    Ok(())
}

/// Counts raw (compressed) bytes read from the underlying file so the import
/// phase can report progress against the downloaded file size.
struct CountingReader<R> {
    inner: R,
    bytes: u64,
}

impl<R: std::io::Read> std::io::Read for CountingReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.bytes += n as u64;
        Ok(n)
    }
}

fn parse_dump(path: &Path, tx: &tokio::sync::mpsc::Sender<Batch>) -> std::io::Result<()> {
    let file = std::fs::File::open(path)?;
    let counting = CountingReader {
        inner: file,
        bytes: 0,
    };
    let decoder = flate2::read::GzDecoder::new(counting);
    let mut reader = std::io::BufReader::with_capacity(1 << 20, decoder);
    let mut line = Vec::with_capacity(4096);
    let mut batch = ImportBatch {
        works: Vec::new(),
        editions: Vec::new(),
        authors: Vec::new(),
        redirects: Vec::new(),
    };
    let mut pending = 0usize;
    let mut last_progress = 0u64;

    loop {
        line.clear();
        let read = reader.read_until(b'\n', &mut line)?;
        if read == 0 {
            break;
        }
        let record = std::str::from_utf8(&line)
            .map_err(|_| {
                std::io::Error::new(std::io::ErrorKind::InvalidData, "record is not valid utf-8")
            })?
            .trim_end_matches(|c| c == '\r' || c == '\n');
        if record.is_empty() {
            continue;
        }
        let mut parts = record.splitn(5, '\t');
        let rec_type = parts.next().unwrap_or("");
        let _key = parts.next().unwrap_or("");
        let _revision = parts.next().unwrap_or("");
        let _last_modified = parts.next().unwrap_or("");
        let Some(json) = parts.next() else {
            continue;
        };

        match rec_type {
            "work" => {
                if let Ok(w) = serde_json::from_str::<DumpWork>(json) {
                    let author_keys: Vec<String> = w
                        .authors
                        .iter()
                        .filter_map(|a| a.author.as_ref().map(|r| r.key.clone()))
                        .collect();
                    batch.works.push(WorkRow {
                        key: w.key,
                        title: w.title,
                        author_keys: serde_json::to_string(&author_keys)
                            .unwrap_or_else(|_| "[]".into()),
                        first_publish_date: w.first_publish_date,
                        json: json.to_string(),
                    });
                    pending += 1;
                }
            }
            "edition" => {
                if let Ok(e) = serde_json::from_str::<DumpEdition>(json) {
                    let mut seen = std::collections::HashSet::new();
                    let isbn = e
                        .isbn_13
                        .iter()
                        .chain(e.isbn_10.iter())
                        .map(|s| s.chars().filter(|c| *c != '-' && *c != ' ').collect::<String>())
                        .filter(|s| !s.is_empty())
                        .filter(|s| seen.insert(s.clone()))
                        .collect::<Vec<String>>()
                        .join(" ");
                    batch.editions.push(EditionRow {
                        key: e.key,
                        work_key: e.works.first().map(|w| w.key.clone()),
                        title: e.title,
                        isbn,
                        json: json.to_string(),
                    });
                    pending += 1;
                }
            }
            "author" => {
                if let Ok(a) = serde_json::from_str::<DumpAuthor>(json) {
                    batch.authors.push(AuthorRow {
                        key: a.key,
                        name: a.name,
                        json: json.to_string(),
                    });
                    pending += 1;
                }
            }
            "redirect" => {
                if let Ok(r) = serde_json::from_str::<DumpRedirect>(json) {
                    if let Some(to) = r.location.or(r.to) {
                        batch.redirects.push((r.key, to));
                        pending += 1;
                    }
                }
            }
            _ => {}
        }

        if pending >= 2000 {
            send_batch(tx, &mut batch)?;
            pending = 0;
        }
        // Report compressed progress roughly every 4 MiB.
        let compressed = reader.get_ref().get_ref().bytes;
        if compressed - last_progress >= 4 << 20 {
            last_progress = compressed;
            tx.blocking_send(Batch::Progress(compressed))
                .map_err(|_| std::io::Error::new(std::io::ErrorKind::BrokenPipe, "import channel closed"))?;
        }
    }
    send_batch(tx, &mut batch)?;
    tx.blocking_send(Batch::Progress(last_progress)).map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::BrokenPipe, "import channel closed")
    })?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Read-side helpers
// ---------------------------------------------------------------------------

fn ol_id_from_key(key: &str) -> String {
    key.trim_start_matches('/').to_string()
}

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

fn parse_date(s: &str) -> Option<NaiveDate> {
    if s.len() == 4 {
        NaiveDate::from_ymd_opt(s.parse().ok()?, 1, 1)
    } else if s.len() == 7 {
        let (y, m) = s.split_once('-')?;
        NaiveDate::from_ymd_opt(y.parse().ok()?, m.parse().ok()?, 1)
    } else {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
    }
}

fn description_from_value(value: Option<&serde_json::Value>) -> Option<String> {
    value.and_then(|v| match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Object(o) => o.get("value").and_then(|v| v.as_str().map(String::from)),
        _ => None,
    })
}

fn normalize_key(foreign_id: &str) -> String {
    let trimmed = foreign_id.trim_start_matches('/');
    if let Some(k) = trimmed.strip_prefix("works/") {
        format!("/works/{k}")
    } else if let Some(k) = trimmed.strip_prefix("books/") {
        format!("/books/{k}")
    } else if trimmed.ends_with('W') {
        format!("/works/{trimmed}")
    } else {
        format!("/books/{trimmed}")
    }
}

fn normalize_author_key(foreign_id: &str) -> String {
    let trimmed = foreign_id.trim_start_matches('/');
    let stripped = trimmed.strip_prefix("authors/").unwrap_or(trimmed);
    format!("/authors/{stripped}")
}

/// Resolve a full key through the redirects table, following up to 10 hops.
async fn resolve_key(db: &sqlx::SqlitePool, key: &str) -> Result<String> {
    let mut current = key.to_string();
    for _ in 0..10 {
        let next: Option<String> = sqlx::query_scalar("SELECT to_key FROM redirects WHERE key = ?")
            .bind(&current)
            .fetch_optional(db)
            .await?;
        match next {
            Some(to) => current = to,
            None => break,
        }
    }
    Ok(current)
}

fn parse_work(row: &WorkRow) -> DumpWork {
    serde_json::from_str(&row.json).unwrap_or_else(|_| DumpWork {
        key: row.key.clone(),
        title: row.title.clone(),
        ..DumpWork::default()
    })
}

fn parse_edition(row: &EditionRow) -> DumpEdition {
    serde_json::from_str(&row.json).unwrap_or_else(|_| DumpEdition {
        key: row.key.clone(),
        title: row.title.clone(),
        ..DumpEdition::default()
    })
}

fn parse_author(row: &AuthorRow) -> DumpAuthor {
    serde_json::from_str(&row.json).unwrap_or_else(|_| DumpAuthor {
        key: row.key.clone(),
        name: row.name.clone(),
        ..DumpAuthor::default()
    })
}

async fn query_work_row(db: &sqlx::SqlitePool, key: &str) -> Result<Option<WorkRow>> {
    let row = sqlx::query_as::<_, (String, String, String, Option<String>, String)>(
        "SELECT key, title, author_keys, first_publish_date, json FROM works WHERE key = ?",
    )
    .bind(key)
    .fetch_optional(db)
    .await?;
    Ok(row.map(
        |(key, title, author_keys, first_publish_date, json)| WorkRow {
            key,
            title,
            author_keys,
            first_publish_date,
            json,
        },
    ))
}

async fn query_edition_row(db: &sqlx::SqlitePool, key: &str) -> Result<Option<EditionRow>> {
    let row = sqlx::query_as::<_, (String, Option<String>, String, String, String)>(
        "SELECT key, work_key, title, isbn, json FROM editions WHERE key = ?",
    )
    .bind(key)
    .fetch_optional(db)
    .await?;
    Ok(row.map(|(key, work_key, title, isbn, json)| EditionRow {
        key,
        work_key,
        title,
        isbn,
        json,
    }))
}

fn edition_row_from_tuple(
    (key, work_key, title, isbn, json): (String, Option<String>, String, String, String),
) -> EditionRow {
    EditionRow {
        key,
        work_key,
        title,
        isbn,
        json,
    }
}

fn author_from_row(row: &AuthorRow) -> Author {
    let parsed = parse_author(row);
    let links = parsed
        .links
        .iter()
        .map(|l| Link {
            url: l.url.clone(),
            label: l.title.clone(),
        })
        .collect();
    Author {
        id: 0,
        foreign_id: ol_id_from_key(&row.key),
        name: row.name.clone(),
        sort_name: None,
        biography: description_from_value(parsed.bio.as_ref()),
        image_url: parsed.photos.first().copied().and_then(|id| cover_url(id, "L")),
        birth_date: parsed.birth_date.as_deref().and_then(parse_date),
        death_date: parsed.death_date.as_deref().and_then(parse_date),
        genres: vec![],
        aliases: parsed.alternate_names,
        links,
        monitored: false,
        added_at: Utc::now(),
        tags: vec![],
    }
}

fn minimal_book_from_edition(row: &EditionRow) -> Book {
    let parsed = parse_edition(row);
    let title = row.title.clone();
    Book {
        id: 0,
        foreign_id: ol_id_from_key(&row.key),
        author_id: 0,
        author_name: None,
        title: title.clone(),
        clean_title: title.to_lowercase(),
        description: None,
        isbn: parsed.isbn_10.first().cloned(),
        isbn13: parsed.isbn_13.first().cloned(),
        asin: None,
        pages: parsed.number_of_pages,
        publisher: parsed.publishers.first().cloned(),
        publish_date: parsed.publish_date.as_deref().and_then(parse_date),
        image_url: parsed.covers.first().copied().and_then(|id| cover_url(id, "L")),
        genres: vec![],
        ratings: None,
        language: "en".into(),
        monitored: false,
        status: "tracked".into(),
        added_at: Utc::now(),
        last_search_at: None,
    }
}

/// Override a work-based Book with the edition's own details when present.
fn apply_edition_overrides(book: &mut Book, row: &EditionRow) {
    let parsed = parse_edition(row);
    if !row.title.is_empty() {
        book.title = row.title.clone();
        book.clean_title = book.title.to_lowercase();
    }
    if let Some(cover_id) = parsed.covers.first().copied() {
        if let Some(url) = cover_url(cover_id, "L") {
            book.image_url = Some(url);
        }
    }
    if let Some(pages) = parsed.number_of_pages {
        book.pages = Some(pages);
    }
    if let Some(date) = parsed.publish_date.as_deref().and_then(parse_date) {
        book.publish_date = Some(date);
    }
    if let Some(publisher) = parsed.publishers.first() {
        book.publisher = Some(publisher.clone());
    }
    if let Some(isbn13) = parsed.isbn_13.first() {
        book.isbn13 = Some(isbn13.clone());
    }
    if let Some(isbn10) = parsed.isbn_10.first() {
        book.isbn = Some(isbn10.clone());
    }
}

impl OlCacheSource {
    async fn book_from_work(&self, row: &WorkRow) -> Result<Book> {
        let parsed = parse_work(row);
        let author_keys: Vec<String> =
            serde_json::from_str(&row.author_keys).unwrap_or_default();
        let author_name = match author_keys.first() {
            Some(k) => self.author_name_for_key(k).await,
            None => None,
        };
        let description = description_from_value(parsed.description.as_ref());
        let title = row.title.clone();
        Ok(Book {
            id: 0,
            foreign_id: ol_id_from_key(&row.key),
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
            publish_date: row.first_publish_date.as_deref().and_then(parse_date),
            image_url: parsed.covers.first().copied().and_then(|id| cover_url(id, "L")),
            genres: parsed.subjects,
            ratings: None,
            language: "en".into(),
            monitored: false,
            status: "tracked".into(),
            added_at: Utc::now(),
            last_search_at: None,
        })
    }

    async fn author_name_for_key(&self, key: &str) -> Option<String> {
        let resolved = resolve_key(&self.db, key).await.ok()?;
        sqlx::query_scalar::<_, String>("SELECT name FROM authors WHERE key = ?")
            .bind(&resolved)
            .fetch_optional(&self.db)
            .await
            .ok()
            .flatten()
    }

    async fn get_book_by_isbn(&self, isbn: &str) -> Result<Book> {
        let normalized: String = isbn.chars().filter(|c| *c != '-' && *c != ' ').collect();
        let pattern = format!("% {normalized} %");
        let row = sqlx::query_as::<_, (String, Option<String>, String, String, String)>(
            "SELECT key, work_key, title, isbn, json FROM editions WHERE (' ' || isbn || ' ') LIKE ? LIMIT 1",
        )
        .bind(&pattern)
        .fetch_optional(&self.db)
        .await?;

        let Some(edition) = row.map(edition_row_from_tuple) else {
            return Err(AppError::NotFound(format!("Book {isbn} not found")));
        };

        let mut book = match &edition.work_key {
            Some(work_key) => {
                let work_key = resolve_key(&self.db, work_key).await?;
                match query_work_row(&self.db, &work_key).await? {
                    Some(work) => self.book_from_work(&work).await?,
                    None => minimal_book_from_edition(&edition),
                }
            }
            None => minimal_book_from_edition(&edition),
        };

        apply_edition_overrides(&mut book, &edition);
        Ok(book)
    }
}

#[async_trait]
impl MetadataSource for OlCacheSource {
    fn name(&self) -> &'static str {
        "ol_dump_cache"
    }

    async fn search_author(&self, query: &str) -> Result<Vec<Author>> {
        let pattern = format!("%{}%", query.to_lowercase());
        let rows = sqlx::query_as::<_, (String, String, String)>(
            "SELECT key, name, json FROM authors WHERE lower(name) LIKE ? ORDER BY name LIMIT 20",
        )
        .bind(&pattern)
        .fetch_all(&self.db)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(key, name, json)| author_from_row(&AuthorRow { key, name, json }))
            .collect())
    }

    async fn get_author(&self, foreign_id: &str) -> Result<Author> {
        let key = normalize_author_key(foreign_id);
        let key = resolve_key(&self.db, &key).await?;
        let row = sqlx::query_as::<_, (String, String, String)>(
            "SELECT key, name, json FROM authors WHERE key = ?",
        )
        .bind(&key)
        .fetch_optional(&self.db)
        .await?;
        match row {
            Some((key, name, json)) => Ok(author_from_row(&AuthorRow { key, name, json })),
            None => Err(AppError::NotFound(format!("Author {foreign_id} not found"))),
        }
    }

    async fn get_author_books(&self, foreign_id: &str) -> Result<Vec<Book>> {
        let key = normalize_author_key(foreign_id);
        let key = resolve_key(&self.db, &key).await?;
        let author_name = sqlx::query_scalar::<_, String>("SELECT name FROM authors WHERE key = ?")
            .bind(&key)
            .fetch_optional(&self.db)
            .await?;

        let rows = sqlx::query_as::<_, (String, String, String, Option<String>, String)>(
            "SELECT w.key, w.title, w.author_keys, w.first_publish_date, w.json
             FROM works w
             WHERE EXISTS (SELECT 1 FROM json_each(w.author_keys) je WHERE je.value = ?)
             LIMIT 50",
        )
        .bind(&key)
        .fetch_all(&self.db)
        .await?;

        let mut books = Vec::new();
        for (key, title, _author_keys, first_publish_date, json) in rows {
            let parsed: DumpWork = serde_json::from_str(&json).unwrap_or_else(|_| DumpWork {
                key: key.clone(),
                title: title.clone(),
                ..DumpWork::default()
            });
            books.push(Book {
                id: 0,
                foreign_id: ol_id_from_key(&key),
                author_id: 0,
                author_name: author_name.clone(),
                title: title.clone(),
                clean_title: title.to_lowercase(),
                description: description_from_value(parsed.description.as_ref()),
                isbn: None,
                isbn13: None,
                asin: None,
                pages: None,
                publisher: None,
                publish_date: first_publish_date.as_deref().and_then(parse_date).map(|d| {
                    NaiveDate::from_ymd_opt(d.year(), 1, 1).unwrap_or(d)
                }),
                image_url: None,
                genres: parsed.subjects,
                ratings: None,
                language: "en".into(),
                monitored: false,
                status: "tracked".into(),
                added_at: Utc::now(),
                last_search_at: None,
            });
        }
        Ok(books)
    }

    async fn search_book(&self, query: &str) -> Result<Vec<Book>> {
        let pattern = format!("%{}%", query.to_lowercase());
        let mut books: Vec<Book> = Vec::new();
        let mut seen = std::collections::HashSet::new();

        let rows = sqlx::query_as::<_, (String, String, String, Option<String>, String)>(
            "SELECT w.key, w.title, w.author_keys, w.first_publish_date, w.json
             FROM works w
             WHERE lower(w.title) LIKE ?
                OR EXISTS (
                    SELECT 1 FROM json_each(w.author_keys) je
                    JOIN authors a ON a.key = je.value
                    WHERE lower(a.name) LIKE ?
                )
             ORDER BY w.title
             LIMIT 20",
        )
        .bind(&pattern)
        .bind(&pattern)
        .fetch_all(&self.db)
        .await?;

        for r in rows {
            let row = WorkRow {
                key: r.0,
                title: r.1,
                author_keys: r.2,
                first_publish_date: r.3,
                json: r.4,
            };
            if seen.insert(row.key.clone()) {
                books.push(self.book_from_work(&row).await?);
            }
        }

        if books.len() < 20 {
            let work_keys: Vec<String> = sqlx::query_as::<_, (String,)>(
                "SELECT DISTINCT e.work_key
                 FROM editions e
                 WHERE e.work_key IS NOT NULL
                   AND lower(e.title) LIKE ?
                   AND e.work_key NOT IN (SELECT key FROM works WHERE lower(title) LIKE ?)
                 LIMIT 20",
            )
            .bind(&pattern)
            .bind(&pattern)
            .fetch_all(&self.db)
            .await?
            .into_iter()
            .map(|(k,)| k)
            .collect();
            for work_key in work_keys {
                if books.len() >= 20 {
                    break;
                }
                if let Some(row) = query_work_row(&self.db, &work_key).await? {
                    if seen.insert(row.key.clone()) {
                        books.push(self.book_from_work(&row).await?);
                    }
                }
            }
        }

        Ok(books)
    }

    async fn get_book(&self, foreign_id: &str) -> Result<Book> {
        if looks_like_isbn(foreign_id) {
            return self.get_book_by_isbn(foreign_id).await;
        }

        let key = normalize_key(foreign_id);
        let key = resolve_key(&self.db, &key).await?;

        if let Some(work) = query_work_row(&self.db, &key).await? {
            return self.book_from_work(&work).await;
        }

        if let Some(edition) = query_edition_row(&self.db, &key).await? {
            if let Some(work_key) = edition.work_key.clone() {
                let work_key = resolve_key(&self.db, &work_key).await?;
                if let Some(work) = query_work_row(&self.db, &work_key).await? {
                    let mut book = self.book_from_work(&work).await?;
                    apply_edition_overrides(&mut book, &edition);
                    return Ok(book);
                }
            }
            return Ok(minimal_book_from_edition(&edition));
        }

        Err(AppError::NotFound(format!("Book {foreign_id} not found")))
    }

    async fn get_book_editions(&self, foreign_id: &str) -> Result<Vec<Edition>> {
        let key = normalize_key(foreign_id);
        let key = resolve_key(&self.db, &key).await?;
        let work_key = if query_work_row(&self.db, &key).await?.is_some() {
            key
        } else if let Some(edition) = query_edition_row(&self.db, &key).await? {
            edition.work_key.unwrap_or(key)
        } else {
            key
        };
        let rows = sqlx::query_as::<_, (String, Option<String>, String, String, String)>(
            "SELECT key, work_key, title, isbn, json FROM editions WHERE work_key = ? LIMIT 50",
        )
        .bind(&work_key)
        .fetch_all(&self.db)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let row = edition_row_from_tuple(r);
                let parsed = parse_edition(&row);
                Edition {
                    id: 0,
                    book_id: 0,
                    foreign_edition_id: ol_id_from_key(&row.key),
                    isbn13: parsed.isbn_13.first().cloned(),
                    asin: None,
                    title: row.title,
                    language: "en".into(),
                    format: EditionFormat::EBook,
                    quality: None,
                    publisher: parsed.publishers.first().cloned(),
                    pages: parsed.number_of_pages,
                    release_date: parsed.publish_date.as_deref().and_then(parse_date),
                    image_url: parsed.covers.first().copied().and_then(|id| cover_url(id, "L")),
                    monitored: false,
                }
            })
            .collect())
    }

    async fn get_series(&self, _foreign_id: &str) -> Result<Series> {
        Err(AppError::NotFound("Series not supported from offline cache".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ensure_schema(&pool).await.unwrap();
        seed(&pool).await.unwrap();
        pool
    }

    async fn seed(pool: &sqlx::SqlitePool) -> Result<()> {
        sqlx::query("INSERT OR REPLACE INTO works (key, title, author_keys, first_publish_date, json) VALUES (?, ?, ?, ?, ?)")
            .bind("/works/OL1W")
            .bind("The Great Book")
            .bind(r#"["/authors/OL1A"]"#)
            .bind("2000")
            .bind(r#"{"key":"/works/OL1W","title":"The Great Book","first_publish_date":"2000","description":{"value":"A great read"},"subjects":["Fiction","Classic"],"covers":[12345],"authors":[{"author":{"key":"/authors/OL1A"}}]}"#)
            .execute(pool).await?;
        sqlx::query("INSERT OR REPLACE INTO authors (key, name, json) VALUES (?, ?, ?)")
            .bind("/authors/OL1A")
            .bind("Jane Author")
            .bind(r#"{"key":"/authors/OL1A","name":"Jane Author","bio":{"value":"A brilliant author"},"photos":[67890],"alternate_names":["J. Author"]}"#)
            .execute(pool).await?;
        sqlx::query("INSERT OR REPLACE INTO editions (key, work_key, title, isbn, json) VALUES (?, ?, ?, ?, ?)")
            .bind("/books/OL1M")
            .bind("/works/OL1W")
            .bind("The Great Book (Deluxe)")
            .bind("9780000000001")
            .bind(r#"{"key":"/books/OL1M","title":"The Great Book (Deluxe)","works":[{"key":"/works/OL1W"}],"isbn_13":["9780000000001"],"publishers":["Example Press"],"publish_date":"2001-05-01","number_of_pages":123,"covers":[99999]}"#)
            .execute(pool).await?;
        sqlx::query("INSERT OR REPLACE INTO redirects (key, to_key) VALUES (?, ?)")
            .bind("/works/OL2W")
            .bind("/works/OL1W")
            .execute(pool).await?;
        Ok(())
    }

    #[tokio::test]
    async fn get_book_resolves_work_and_author() {
        let src = OlCacheSource {
            db: test_pool().await,
        };
        let book = src.get_book("works/OL1W").await.unwrap();
        assert_eq!(book.title, "The Great Book");
        assert_eq!(book.author_name.as_deref(), Some("Jane Author"));
        assert_eq!(book.foreign_id, "works/OL1W");
        assert_eq!(book.genres, vec!["Fiction", "Classic"]);
        assert_eq!(book.publish_date, NaiveDate::from_ymd_opt(2000, 1, 1));
    }

    #[tokio::test]
    async fn get_book_by_isbn_overrides_edition_fields() {
        let src = OlCacheSource {
            db: test_pool().await,
        };
        let book = src.get_book("9780000000001").await.unwrap();
        assert_eq!(book.title, "The Great Book (Deluxe)");
        assert_eq!(book.isbn13.as_deref(), Some("9780000000001"));
        assert_eq!(book.pages, Some(123));
        assert_eq!(book.publisher.as_deref(), Some("Example Press"));
        assert_eq!(book.author_name.as_deref(), Some("Jane Author"));
        assert_eq!(book.foreign_id, "works/OL1W");
    }

    #[tokio::test]
    async fn get_book_follows_redirects() {
        let src = OlCacheSource {
            db: test_pool().await,
        };
        let book = src.get_book("OL2W").await.unwrap();
        assert_eq!(book.title, "The Great Book");
    }

    #[tokio::test]
    async fn search_book_matches_title() {
        let src = OlCacheSource {
            db: test_pool().await,
        };
        let books = src.search_book("great").await.unwrap();
        assert!(books.iter().any(|b| b.title == "The Great Book"));
    }

    #[tokio::test]
    async fn get_book_editions_returns_editions() {
        let src = OlCacheSource {
            db: test_pool().await,
        };
        let editions = src.get_book_editions("works/OL1W").await.unwrap();
        assert_eq!(editions.len(), 1);
        assert_eq!(editions[0].isbn13.as_deref(), Some("9780000000001"));
        assert_eq!(editions[0].foreign_edition_id, "books/OL1M");
        assert_eq!(editions[0].publisher.as_deref(), Some("Example Press"));
        assert_eq!(editions[0].pages, Some(123));
    }

    #[tokio::test]
    async fn get_author_maps_name_and_bio() {
        let src = OlCacheSource {
            db: test_pool().await,
        };
        let author = src.get_author("authors/OL1A").await.unwrap();
        assert_eq!(author.name, "Jane Author");
        assert_eq!(author.foreign_id, "authors/OL1A");
        assert_eq!(author.biography.as_deref(), Some("A brilliant author"));
        assert_eq!(
            author.image_url.as_deref(),
            Some("https://covers.openlibrary.org/b/id/67890-L.jpg")
        );
        assert_eq!(author.aliases, vec!["J. Author"]);
    }

    #[tokio::test]
    async fn import_dump_file_populates_tables() {
        // Build a small gzip'd dump fixture matching the ol_dump line format.
        let lines = [
            "work\t/works/OL1W\t1\t2000-01-01T00:00:00Z\t{\"key\":\"/works/OL1W\",\"title\":\"Imported Book\",\"first_publish_date\":\"1999\",\"authors\":[{\"author\":{\"key\":\"/authors/OL1A\"}}],\"subjects\":[\"Sci-Fi\"]}",
            "author\t/authors/OL1A\t1\t2000-01-01T00:00:00Z\t{\"key\":\"/authors/OL1A\",\"name\":\"Ada Writer\"}",
            "edition\t/books/OL1M\t1\t2000-01-01T00:00:00Z\t{\"key\":\"/books/OL1M\",\"title\":\"Imported Book (1st)\",\"works\":[{\"key\":\"/works/OL1W\"}],\"isbn_13\":[\"9781111111111\"],\"number_of_pages\":200}",
            "redirect\t/works/OLOLD\t1\t2000-01-01T00:00:00Z\t{\"key\":\"/works/OLOLD\",\"location\":\"/works/OL1W\"}",
        ]
        .join("\n");

        let dir = std::env::temp_dir();
        let gz_path = dir.join(format!("ol_dump_test_{}.dump.gz", std::process::id()));
        {
            let file = std::fs::File::create(&gz_path).unwrap();
            let mut enc = flate2::write::GzEncoder::new(file, flate2::Compression::default());
            use std::io::Write;
            enc.write_all(lines.as_bytes()).unwrap();
            enc.finish().unwrap();
        }

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ensure_schema(&pool).await.unwrap();
        let handle = ImportHandle::new();
        let counts = import_dump_file(&pool, &gz_path, &handle).await.unwrap();

        let _ = std::fs::remove_file(&gz_path);
        assert_eq!(counts.works, 1);
        assert_eq!(counts.authors, 1);
        assert_eq!(counts.editions, 1);
        assert_eq!(counts.redirects, 1);

        let src = OlCacheSource { db: pool };
        let book = src.get_book("works/OLOLD").await.unwrap();
        assert_eq!(book.title, "Imported Book");
        assert_eq!(book.author_name.as_deref(), Some("Ada Writer"));
        assert_eq!(book.foreign_id, "works/OL1W");
        assert_eq!(book.genres, vec!["Sci-Fi"]);

        let by_isbn = src.get_book("9781111111111").await.unwrap();
        assert_eq!(by_isbn.title, "Imported Book (1st)");
        assert_eq!(by_isbn.pages, Some(200));
    }
}
