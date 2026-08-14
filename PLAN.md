# ReadingRoom - Plan

A self-hosted ebook and audiobook management server, inspired by LazyLibrarian and Readarr, written in Rust with a SolidJS frontend.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   SolidJS Frontend                       │
│              (Vite + TypeScript + Tailwind)               │
│    ┌──────────────┐  ┌──────────────┐                   │
│    │   Authors/    │  │   Search/    │                   │
│    │   Books UI    │  │   Activity   │                   │
│    └──────────────┘  └──────────────┘                   │
│    ┌──────────────┐  ┌──────────────┐                   │
│    │   Settings    │  │   System     │                   │
│    └──────────────┘  └──────────────┘                   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/JSON + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                  Rust Backend (Axum)                     │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │  REST API   │  │  WebSocket  │  │  Auth/MW   │        │
│  │  (Axum)     │  │  (tungsten)│  │  (JWT)    │         │
│  └──────┬──────┘  └────────────┘  └────────────┘         │
│         │                                                 │
│  ┌──────▼──────────────────────────────────────────────┐ │
│  │                  Service Layer                        │ │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │ │
│  │  │ Author/  │  │  Search  │  │  Download/Import  │  │ │
│  │  │ Book Mgmt│  │  Engine  │  │  Pipeline         │  │ │
│  │  └──────────┘  └────┬─────┘  └────────┬──────────┘  │ │
│  │  ┌──────────────────┴──────────────────┴──────────┐  │ │
│  │  │            Decision Engine                      │  │ │
│  │  │  (quality matching, cutoff, upgrades, scoring) │  │ │
│  │  └──────────────────┬─────────────────────────────┘  │ │
│  └─────────────────────┼────────────────────────────────┘ │
│                        │                                   │
│  ┌─────────────────────┼────────────────────────────────┐ │
│  │  ┌──────────────────┴──────────────────────────────┐ │ │
│  │  │             Provider System                      │ │ │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │ │ │
│  │  │  │ Indexers  │  │Metadata  │  │ Downloaders  │  │ │ │
│  │  │  │ (traits)  │  │Sources   │  │ (traits)     │  │ │ │
│  │  │  │           │  │(traits)  │  │              │  │ │ │
│  │  │  │•Torznab   │  │•OpenLib  │  │•Transmission │  │ │ │
│  │  │  │•Newznab   │  │•Google   │  │•qBittorrent  │  │ │ │
│  │  │  │•MAM       │  │•GoodReads│  │•Deluge       │  │ │ │
│  │  │  │•Gazelle   │  │•HardCover│  │•SABnzbd      │  │ │ │
│  │  │  │•RSS       │  │•Calibre  │  │•Blackhole    │  │ │ │
│  │  │  └──────────┘  └──────────┘  └──────────────┘  │ │ │
│  │  └─────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │  SQLite DB  │  │  Scheduler  │  │  Config    │        │
│  │  (sqlx)     │  │  (tokio-   │  │  (serde +  │        │
│  │             │  │   cron)    │  │   toml)    │        │
│  └────────────┘  └────────────┘  └────────────┘         │
└──────────────────────────────────────────────────────────┘
```

## Phase 1: Foundation

### 1.1 Project Structure (Monorepo)

```
readingroom/
├── flake.nix                   # Nix flake (devShell + package)
├── Cargo.toml                  # Workspace root
├── crates/
│   ├── server/                 # Main binary (Axum web server)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs
│   │       ├── config.rs       # TOML config loading
│   │       ├── api/            # REST routes
│   │       ├── db/             # SQLite migrations & queries
│   │       ├── scheduler/      # Background job scheduler
│   │       └── auth/           # JWT auth
│   ├── core/                   # Shared business logic
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── models/         # Domain models (Author, Book, Edition, etc.)
│   │       ├── services/       # AuthorMgmt, BookMgmt, SearchEngine, etc.
│   │       ├── providers/      # Indexer, MetadataSource, Downloader traits
│   │       └── decision/       # Decision engine
│   ├── providers/              # Provider implementations
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── torznab/        # Torznab indexer
│   │       ├── newznab/        # Newznab indexer
│   │       ├── gazelle/        # Gazelle-based trackers
│   │       ├── mam/            # MyAnonamouse
│   │       └── rss/            # Generic RSS
│   ├── metadata/               # Metadata source implementations
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── openlibrary/    # OpenLibrary API
│   │       ├── googlebooks/    # Google Books API
│   │       ├── goodreads/      # Goodreads (scrape or API)
│   │       └── hardcover/      # HardCover API
│   ├── downloaders/            # Download client implementations
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── transmission/   # Transmission RPC
│   │       ├── qbittorrent/    # qBittorrent API
│   │       ├── deluge/         # Deluge RPC
│   │       └── sabnzbd/        # SABnzbd API
│   └── db/                     # Database crate (sqlx migrations/queries)
│       ├── Cargo.toml
│       ├── migrations/         # SQLite migrations
│       └── src/
│           ├── lib.rs
│           ├── authors.rs
│           ├── books.rs
│           ├── editions.rs
│           └── providers.rs
├── frontend/                   # SolidJS SPA
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── index.tsx
│       ├── App.tsx
│       ├── api/               # API client
│       ├── routes/            # Page components
│       ├── components/        # Shared components
│       ├── stores/            # Signal stores
│       └── types/             # TypeScript types
└── scripts/                   # Dev/build helper scripts
```

### 1.2 Key Crate Responsibilities

| Crate | Purpose |
|-------|---------|
| `server` | Axum HTTP server, route definitions, middleware, startup |
| `core` | Domain logic, service layer, provider traits, models |
| `providers` | Concrete indexer implementations (search sources) |
| `metadata` | Concrete metadata source implementations (book/author info) |
| `downloaders` | Concrete download client implementations |
| `db` | Database schema, migrations, typed query functions |

### 1.3 Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| HTTP framework | **Axum** | Async, tower-based, great ergonomics, strong ecosystem |
| Database | **SQLite** + **sqlx** | Checked queries at compile time, no external DB needed |
| Async runtime | **tokio** | De facto standard async runtime in Rust |
| ORM/query | **sqlx** | Compile-time checked SQL, migration support |
| Config | **serde** + **toml** | Strongly typed config with serde derive |
| Scheduler | **tokio-cron-scheduler** | Cron-like background job scheduling |
| RSS parsing | **feed-rs** | RSS/Atom feed parsing |
| HTTP client | **reqwest** | Async HTTP client with TLS support |
| Auth | **jsonwebtoken** (JWT) | Stateless auth tokens |
| WebSocket | **tungstenite** via **axum** | Real-time push to frontend |
| Frontend framework | **SolidJS** + **Vite** | Reactive, performant, small bundle |
| Styling | **Tailwind CSS** | Utility-first CSS |
| Frontend HTTP | **TanStack Query** + **fetch** | Data fetching and caching |
| Flake CI | **nix flake check** | Rust builds via `crane`, JS builds via `buildNpmPackage` |

### 1.4 Domain Model (Initial)

```
Author
├── id: i64
├── foreign_id: String (Goodreads/OpenLibrary)
├── name: String
├── sort_name: String
├── biography: String
├── image_url: String
├── birth_date: Option<NaiveDate>
├── death_date: Option<NaiveDate>
├── genres: Vec<String>
├── aliases: Vec<String>
├── links: Vec<Link>
├── monitored: bool
├── added_at: DateTime<Utc>
└── tags: Vec<i64>

Book
├── id: i64
├── foreign_id: String (Goodreads/OpenLibrary/ISBN)
├── author_id: i64
├── title: String
├── clean_title: String
├── description: String
├── isbn: Option<String>
├── isbn13: Option<String>
├── asin: Option<String>
├── pages: Option<i32>
├── publisher: Option<String>
├── publish_date: Option<NaiveDate>
├── image_url: String
├── genres: Vec<String>
├── ratings: Option<f64>
├── language: String
├── monitored: bool
├── series: Vec<SeriesLink>
├── editions: Vec<Edition>
├── added_at: DateTime<Utc>
└── last_search_at: Option<DateTime<Utc>>

Edition
├── id: i64
├── book_id: i64
├── foreign_edition_id: String
├── isbn13: Option<String>
├── asin: Option<String>
├── title: String
├── language: String
├── format: EditionFormat (EBook | AudioBook | Physical)
├── publisher: Option<String>
├── pages: Option<i32>
├── release_date: Option<NaiveDate>
├── image_url: String
├── monitored: bool
└── book_files: Vec<BookFile>

BookFile
├── id: i64
├── edition_id: i64
├── path: String
├── size: i64
├── quality: Quality
├── format: String (EPUB, MOBI, PDF, MP3, M4B, FLAC)
├── media_info: Option<MediaInfo>
├── date_added: DateTime<Utc>
├── calibre_id: Option<i64>
└── part: Option<i32>

Series
├── id: i64
├── foreign_series_id: String
├── title: String
├── description: String
├── numbered: bool
└── work_count: i32

SeriesBookLink
├── series_id: i64
├── book_id: i64
├── position: f64 (supports 1.5, 2.5, etc.)
├── is_primary: bool
└── sort: Option<String>
```

## Phase 2: Core Services

### 2.1 Author & Book Management

- **Add Author** - Search by name across metadata sources, select and track
- **Monitor** - Per-author and per-book monitoring toggle
- **Refresh** - Periodically re-fetch metadata for tracked authors/books
- **Bulk Import** - Import from Goodreads shelves, Calibre library, etc.

### 2.2 Metadata Source System (trait-based)

```rust
#[async_trait]
trait MetadataSource: Send + Sync {
    fn name(&self) -> &'static str;
    async fn search_author(&self, query: &str) -> Result<Vec<Author>>;
    async fn get_author(&self, foreign_id: &str) -> Result<Author>;
    async fn get_author_books(&self, foreign_id: &str) -> Result<Vec<Book>>;
    async fn search_book(&self, query: &str) -> Result<Vec<Book>>;
    async fn get_book(&self, foreign_id: &str) -> Result<Book>;
    async fn get_book_editions(&self, foreign_id: &str) -> Result<Vec<Edition>>;
    async fn get_series(&self, foreign_id: &str) -> Result<Series>;
}
```

Initial implementations:
- OpenLibrary (free, generous API)
- Google Books (requires API key)
- Goodreads (scraping proxy, like Readarr's bookinfo microservice)
- HardCover (if viable API)

### 2.3 Search Engine

The search engine orchestrates the full search flow:

1. **Trigger** - Manual, automatic (scheduler), RSS sync
2. **Iterate enabled indexers** (Torznab, Newznab, Gazelle, MAM, RSS)
3. **Parse results** into normalized `Release` structs
4. **Decision Engine** evaluates each release:
   - Basic filters (size, age, language)
   - Quality matching (EPUB vs MOBI vs MP3 vs M4B)
   - Title/author fuzzy matching (via `strsim` or `aho-corasick`)
   - Upgrade checking (do we already have a better quality?)
   - Blocklist checking
5. **Select best release** by scoring
6. **Send to download client**

```rust
struct Release {
    title: String,
    info_url: String,
    download_url: String,
    size: i64,
    pub_date: DateTime<Utc>,
    indexer: String,
    download_type: DownloadType (NZB | Torrent | Magnet),
    seeders: Option<i32>,
    peers: Option<i32>,
    grabs: Option<i32>,
    category: Vec<String>,
    resolution: Option<String>, // for audiobooks (bitrate)
}
```

### 2.4 Indexer System (trait-based)

```rust
#[async_trait]
trait Indexer: Send + Sync {
    fn name(&self) -> &str;
    fn supports_rss(&self) -> bool;
    fn supports_search(&self) -> bool;
    async fn rss_sync(&self) -> Result<Vec<Release>>;
    async fn search(&self, query: &SearchQuery) -> Result<Vec<Release>>;
    async fn search_book(&self, book: &Book) -> Result<Vec<Release>>;
    async fn search_author(&self, author: &Author) -> Result<Vec<Release>>;
}
```

Initial implementations:
- **Torznab** - Generic torznab-compatible indexers (Jackett/Prowlarr)
- **Newznab** - Generic newznab-compatible usenet indexers
- **Gazelle** - For RED/OPS/Orpheus-style trackers
- **MyAnonamouse (MAM)** - Dedicated ebook/audiobook tracker
- **Generic RSS** - Configurable RSS feeds
- **Direct** - Direct download site parsers (Z-Library, Anna's Archive)

### 2.5 Download Client System (trait-based)

```rust
#[async_trait]
trait DownloadClient: Send + Sync {
    fn name(&self) -> &str;
    fn protocol(&self) -> DownloadProtocol;
    async fn add_release(&self, release: &Release) -> Result<DownloadId>;
    async fn remove_release(&self, id: &DownloadId) -> Result<()>;
    async fn get_status(&self, id: &DownloadId) -> Result<DownloadStatus>;
    async fn list_active(&self) -> Result<Vec<DownloadItem>>;
    async fn get_config(&self) -> Result<ClientConfig>;
}
```

Initial implementations focus on what user requested:
- **Transmission** - RPC via `transmission-rpc` crate or raw HTTP
- **qBittorrent** - Web API v2
- **Deluge** - Deluge RPC
- **SABnzbd** - SABnzbd API
- **Blackhole** - Watch directory for manual processing

### 2.6 Download & Import Pipeline

```
Search → Download Client → Completed Event → Import
                                               ├── Validate (extension, size)
                                               ├── Extract (zip/rar)
                                               ├── Preprocess (convert format, tag)
                                               ├── Rename (configurable pattern)
                                               ├── Write metadata (opf, cover)
                                               └── Move to library
                                                     └── Update DB status
```

## Phase 3: API & Frontend

### 3.1 REST API Endpoints

```
# Authors
GET    /api/v1/author              # List authors (paginated, filterable)
POST   /api/v1/author              # Add new author
GET    /api/v1/author/:id          # Author details
PUT    /api/v1/author/:id          # Update author (monitor, etc.)
DELETE /api/v1/author/:id          # Remove author
POST   /api/v1/author/:id/search   # Trigger author catalog search
POST   /api/v1/author/search       # Search metadata sources for author

# Books
GET    /api/v1/book                # List books (paginated, filterable)
GET    /api/v1/book/:id            # Book details with editions
PUT    /api/v1/book/:id            # Update book
GET    /api/v1/book/:id/files      # List book files
POST   /api/v1/book/search         # Search metadata sources for book

# Search & Activity
GET    /api/v1/search              # Search indexers (query params)
GET    /api/v1/activity            # Download/import history
GET    /api/v1/queue               # Active downloads
POST   /api/v1/queue/:id           # Remove from queue

# System
GET    /api/v1/system/status       # Health check
GET    /api/v1/system/config       # Get config
PUT    /api/v1/system/config       # Update config
POST   /api/v1/system/backup       # Trigger backup

# Providers
GET    /api/v1/indexers            # List configured indexers
POST   /api/v1/indexers            # Add indexer
PUT    /api/v1/indexers/:id        # Update indexer
DELETE /api/v1/indexers/:id        # Remove indexer
POST   /api/v1/indexers/test      # Test indexer connectivity

GET    /api/v1/downloadclients     # List download clients
POST   /api/v1/downloadclients     # Add download client
PUT    /api/v1/downloadclients/:id # Update
DELETE /api/v1/downloadclients/:id # Remove
POST   /api/v1/downloadclients/test # Test connectivity

GET    /api/v1/metadatasources     # List metadata sources
PUT    /api/v1/metadatasources/:id # Configure

# Calendar
GET    /api/v1/calendar            # Upcoming releases

# Notifications
GET    /api/v1/notifications       # List notification connections
POST   /api/v1/notifications       # Add
PUT    /api/v1/notifications/:id   # Update
DELETE /api/v1/notifications/:id   # Remove
POST   /api/v1/notifications/test  # Test notification
```

### 3.2 Frontend Routes (SolidJS)

```
/                          → Dashboard / Activity
/authors                   → Author list
/authors/:id               → Author detail + book shelf
/books                     → Book list
/books/:id                 → Book detail + editions
/wanted                    → Missing books
/activity                  → Download/import history
/queue                     → Active downloads
/calendar                  → Upcoming releases
/blocklist                 → Blocked releases
/settings                  → Settings hub
/settings/indexers         → Indexer management
/settings/downloadclients  → Download client management
/settings/metadata         → Metadata source configuration
/settings/general          → General config
/settings/notifications    → Notification connections
/system/status             → Health, logs, backups
/system/logs               → Log viewer
```

### 3.3 UI Components (Tentative)

- `DataTable` with sorting, filtering, multi-select
- `SearchBar` for author/book search with results dropdown
- `AddAuthorModal` / `AddBookModal`
- `ReleaseCard` for search results with quality badges
- `StatusBadge` for want/have/snatched status
- `QualityProfileForm`
- `SeriesTag` with position display
- `CoverWall` grid view
- `Calendar` for release dates

## Phase 4: Advanced Features

### 4.1 Scheduling (Background Jobs)

| Job | Interval | Description |
|-----|----------|-------------|
| `rss_sync` | 15 min | Fetch RSS from all enabled indexers |
| `search_missing` | 6 hours | Search for all monitored but missing books |
| `search_cutoff` | 12 hours | Search for upgrades to meet quality cutoff |
| `refresh_authors` | 24 hours | Refresh author metadata from sources |
| `refresh_books` | 24 hours | Refresh book metadata from sources |
| `process_downloads` | 1 min | Check download clients for completed items |
| `backup` | 24 hours | Backup database and config |
| `cleanup` | 1 hour | Clean temp files, stale cache |

### 4.2 Notifications

```rust
#[async_trait]
trait NotificationService: Send + Sync {
    fn name(&self) -> &str;
    async fn on_grab(&self, release: &Release) -> Result<()>;
    async fn on_import(&self, book: &Book, file: &BookFile) -> Result<()>;
    async fn on_upgrade(&self, book: &Book, old_file: &BookFile, new_file: &BookFile) -> Result<()>;
    async fn on_health_issue(&self, issue: &HealthIssue) -> Result<()>;
}
```

Initial implementations:
- Apprise (covers 100+ services via Apprise API)
- Webhook (generic)
- Email (SMTP)
- Telegram
- Discord
- Custom script

### 4.3 Quality Profiles

Similar to Radarr/Sonarr - ordered quality groups with cutoff:
- Qualities: EPUB, MOBI, PDF, AZW3 (ebooks) / MP3, M4B, FLAC (audiobooks)
- Profiles: "Any", "Ebooks Only", "Audiobooks Only", "EPUB Preferred"
- Custom formats: Release matching with regex rules

### 4.4 Import Lists (Auto-Add Sources)

- **GoodReads** - Shelves, reading lists, followed authors
- **OpenLibrary** - Bookshelves
- **Calibre** - Library sync

- **CSV** - Wishlist import/export
- **Another ReadingRoom instance** - Multi-instance sync

### 4.5 Post-Processing

- Format conversion (via calibre `ebook-convert` or `ffmpeg`)
- Metadata tagging (audio tags, OPF metadata, cover embedding)
- Audio processing (chapter merging, bitrate normalization)
- Archive extraction (ZIP, RAR, 7z)
- File renaming (configurable patterns)
- Calibre import

### 4.6 Multi-User & Permissions

- JWT-based auth
- Users with roles: Admin, User, ReadOnly
- Per-user reading lists (want-to-read, reading, finished, abandoned)


## Current State (as of 2026-07-28)

### Legend
- ✅ **Done** — fully implemented
- ◐ **Partial** — exists but incomplete (stub, missing features, or not wired)
- ❌ **Not started** — no code exists

---

## Milestone 1: MVP ("Skeleton")

| Item | Status | Details |
|------|--------|---------|
| Nix flake (devShell + build) | ✅ | Rust, Node, pnpm, sqlx-cli, just; `cargo build` and `cargo run` work |
| Cargo workspace (6 crates) | ✅ | `server`, `core`, `db`, `providers`, `metadata`, `downloaders` |
| Axum server: health, config, startup | ✅ | Health check at `/health`, TOML config, `--data-dir` CLI flag, tracing |
| SQLite + sqlx + migration | ✅ | Migration `001_initial.sql` with 17 tables (authors, books, editions, series, history, queue, config, users, etc.) |
| MetadataSource trait | ✅ | `traits::MetadataSource` with 8 methods (search/get author, book, editions, series) |
| OpenLibrary source | ✅ | Real HTTP client (reqwest), search/add author, get author/books/editions |
| Author search API (`GET /api/v1/authors/search`) | ✅ | Proxies to OpenLibrary search |
| Author list API (`GET /api/v1/authors`) | ✅ | Lists tracked authors from DB |
| Author add API (`POST /api/v1/authors`) | ✅ | Inserts into DB with duplicate detection |
| Author detail API (`GET /api/v1/authors/:id`) | ✅ | Tries DB first, falls back to metadata source |
| Author PUT endpoint | ✅ | Updates monitored status |
| Author DELETE endpoint | ✅ | Removes author from DB |
| Book search API (`GET /api/v1/books/search`) | ✅ | Proxies to OpenLibrary |
| Book list API (`GET /api/v1/books`) | ✅ | Lists tracked books from DB |
| Book add API (`POST /api/v1/books`) | ✅ | Inserts into DB with duplicate detection and clean_title |
| Book detail API (`GET /api/v1/books/:id`) | ✅ | Tries DB first, falls back to metadata source |
| Book editions API (`GET /api/v1/books/:id/editions`) | ✅ | Resolves DB id → foreign_id → metadata |
| Combined search API (`GET /api/v1/search`) | ✅ | Searches authors + books in parallel |
| System status API (`GET /api/v1/system/status`) | ✅ | Returns version, name, data_dir, auth state |
| DB queries for books | ✅ | `list_books`, `insert_book`, `get_book_by_id`, `find_book_by_foreign_id`, `get_books_by_author`, `update_book_monitored`, `delete_book` |
| Static file serving for frontend | ✅ | Serves `frontend/dist/` via `tower-http::ServeDir`, fallback for API-only when dist missing |
| SolidJS scaffold | ✅ | Vite + Tailwind + TanStack Query + @solidjs/router, dark layout |
| API client (`api.ts`) | ✅ | `get`/`post`/`put`/`delete` helpers with JSON handling |
| TypeScript types | ✅ | Author, Book, Edition, BookFile, Release, SystemStatus |
| UI store (`stores/index.ts`) | ✅ | Minimal store (sidebar toggle, theme) |
| Layout (`Layout.tsx`) | ✅ | App shell with nav bar (Dashboard, Authors, Books, Queue) and dark background |
| Dashboard page | ✅ | Shows system status card (name, version) |
| Authors list page | ✅ | Displays tracked authors in grid, empty state, "Add Author" toggle |
| Author search UI | ✅ | Search input, results list with image/name/bio, "Add" button per result |
| Author detail page | ✅ | Fetches from API by `:id`, displays name, image, bio, genres, aliases, dates |
| Books list page | ✅ | Displays tracked books in grid, search + add flow |
| Book detail page | ✅ | Shows metadata with image, description, genres |
| Queue page | ✅ | Auto-refreshing download list with status/progress, remove button |
| Tests (Rust + Vitest) | ✅ | 27 backend tests (core unit, provider XML, server integration) + 4 frontend Vitest type tests |

---

## Milestone 2: Search & Download

| Item | Status | Details |
|------|--------|---------|
| Indexer trait | ✅ | `traits::Indexer` with 6 methods (rss_sync, search, search_book, search_author, etc.) |
| Torznab indexer | ✅ | Real quick-xml RSS parsing, seeders/peers/grabs extraction, enclosure/magnet links |
| Newznab indexer | ✅ | Real quick-xml XML parsing (same format as Torznab), NZB download type, seeders/peers/grabs, magnet support |
| RSS indexer | ✅ | Real feed-rs parsing for generic RSS/Atom feeds, magnet/torrent/direct download detection, media enclosures, categories |
| Search engine / Decision engine | ✅ | `BasicDecisionEngine` in `core::search` (jaro_winkler, seeder bonus, quality detection, size sanity). `SearchEngine` in `server::search` orchestrates indexer search + scoring + dedup |
| Indexer search API (`GET /api/v1/search/indexers`) | ✅ | Searches metadata, then searches each book against all indexers, returns scored results |
| Author indexer search (`POST /api/v1/search/indexers/authors/:id`) | ✅ | Searches all monitored books for an author |
| Book indexer search (`POST /api/v1/search/indexers/books/:id`) | ✅ | Searches a single book |
| Download release API (`POST /api/v1/search/indexers/download`) | ✅ | Sends a release + book_id to DownloadManager → download client + creates queue entry |
| Queue API (`GET /api/v1/queue`, `DELETE /api/v1/queue/:id`) | ✅ | Lists active downloads, removes from queue |
| Settings API (indexers + download clients CRUD + test endpoints) | ✅ | `GET/POST /settings/indexers`, `GET/PUT/DELETE /settings/indexers/:id`, `POST /settings/indexers/:id/test`, `GET/POST /settings/downloadclients`, `GET/DELETE /settings/downloadclients/:id`, `POST /settings/downloadclients/:id/test` |
| WebSocket endpoint (`/ws`) | ✅ | axum ws handler, broadcast channel, events for queue_added, download_completed, import_completed |
| DownloadClient trait | ✅ | 7 methods incl. `get_download_path` |
| Transmission client | ✅ | Real RPC with session-id handshake, torrent-add/get/remove/list, session-get, get_download_path |
| qBittorrent client | ✅ | Full Web API v2 implementation: login, add/remove torrent, get status with state mapping, list active, get_config (version + preferences), get_download_path |
| Deluge client | ✅ | Full JSON-RPC v2 implementation: auth.login, core.add_torrent_url, get_torrent_status state mapping, list active, get_config (daemon.info), get_download_path |
| SABnzbd client | ❌ | Not even a stub file |
| Blackhole client | ❌ | Not even a stub file |
| Download pipeline | ✅ | `DownloadManager` sends release to client, creates queue entry, polls active, handles completion |
| Import pipeline | ✅ | `ImportManager` scans completed download dirs for ebook/audio files, copies to library, creates edition/book_file/history records. Auto-triggered on completion |
| Search results UI | ✅ | Shows scored releases from indexer search on AuthorDetail page with Download button |
| Queue UI | ✅ | Auto-refresh, progress bar, status colors, remove |
| Indexer provider factory | ✅ | `from_config` in `providers::lib` maps string → boxed impl |
| Settings UI: edit indexer JSON + test buttons + status indicators | ✅ | Inline edit form on Indexers tab, Test button per indexer/client, connected status + version shown on successful test |

---

## Milestone 3: Automation

| Item | Status | Details |
|------|--------|---------|
| Scheduler infrastructure | ✅ | `crates/server/src/scheduler.rs` — `JobScheduler` with poll_downloads (30s) running; stubs for rss_sync, search_missing, refresh_authors |
| Poll downloads job | ✅ | `poll_active` runs every 30s, updates queue status, triggers import on completion |
| RSS sync job | ◐ | Placeholder — no implementation yet |
| Automatic missing book search | ✅ | Hourly job searches monitored books with no files, downloads best match (score > 50) |
| Post-processing (rename, metadata, cover) | ✅ | ZIP archive extraction before scan; configurable rename patterns via `library.book_file_format` and `library.author_folder_format` with `{book_id}`, `{book_title}`, `{quality}`, `{format}`, `{ext}` placeholders; `library.rename_files` toggle |
| Wanted/Missing UI | ✅ | Frontend page at `/wanted` showing monitored books with no files |
| Wanted API (`GET /api/v1/wanted`) | ✅ | Returns monitored books with no files |
| Wanted auto-search (`POST /api/v1/wanted/search`) | ✅ | Triggers search + download for all missing books |
| Wanted per-book search (`POST /api/v1/wanted/search/:id`) | ✅ | Searches indexers + downloads best match for a specific book |
| Wanted frontend route | ✅ | Route at `/wanted` |
| Search All + per-book buttons | ✅ | On Wanted page: "Search All" + "Search & Download" per card |
| Nav link for Wanted | ✅ | Added to sidebar navigation |
| Import existing collection | ❌ | Not started |

---

## Milestone 4: Production Features

| Item | Status | Details |
|------|--------|---------|
| Quality profiles + custom formats | ❌ | Not started |
| Notifications (Apprise, Telegram, Email, Webhook) | ✅ | `NotificationService` trait + `NotificationManager` in `notifications.rs`, Apprise HTTP impl via webhook_url, CRUD API at `/api/v1/notifications`, frontend Notifications tab, wired into download (grab) and import (imported) events |
| GoodReads metadata source | ◐ | `goodreads.rs` is a comment: `// TODO: Goodreads metadata source` |
| Gazelle indexer | ❌ | Not even a stub file |
| MAM indexer | ❌ | Not even a stub file |
| SABnzbd downloader | ❌ | Not even a stub file |
| Auth system (JWT, user management) | ✅ | Login/register endpoints in `api/auth.rs`, JWT middleware, frontend login page with auth state, localStorage token storage |
| Calendar view | ✅ | Backend `GET /api/v1/calendar` returns books grouped by year-month; frontend page at `/calendar` with month headings and book cards |
| Activity history | ✅ | Frontend page at `/activity` showing download/import history |
| Activity API (`GET /api/v1/history`) | ✅ | Returns paginated download/import history |
| Activity frontend route | ✅ | Route at `/activity` |
| Nav link for Activity | ✅ | Added to sidebar navigation |
| Backup/restore | ✅ | `POST /api/v1/system/backup` creates timestamped ZIP with DB + manifest; `POST /api/v1/system/restore` extracts and replaces DB |
| Multi-user + reading lists | ❌ | Stretch goal — deferred |

---

## Milestone 5: Polish & Scale

| Item | Status | Details |
|------|--------|---------|
| Google Books metadata source | ◐ | `google_books.rs` is a comment: `// TODO: Google Books API metadata source` |
| HardCover metadata source | ❌ | Referenced in `metadata::lib::primary_source()` as a TODO comment |
| Calibre integration | ❌ | Not started |

| Performance optimization / caching | ❌ | Not started |
| System health checks / logging | ❌ | Not started |
| Import lists (GoodReads shelves) | ❌ | Not started |
| Bulk import from existing collection | ❌ | Not started |

---

## Summary

**Done in code:** Nix flake, 6-crate workspace, 27 backend tests + 4 frontend tests, SQLite schema, OpenLibrary metadata, Torznab/Newznab/RSS indexers, Transmission client, Axum server with `--data-dir`, SolidJS scaffold, author/book search/add UI, SearchEngine + DecisionEngine, DownloadManager + ImportManager + Scheduler, static file serving, JWT auth system (login/register + middleware + default admin bootstrapping).

**Performance audit completed — fixes applied:**
- `core/src/search.rs` — `release.clone()` eliminated (by-value move), `clean_title` no longer re-lowercased, double alloc for `clean_book` removed
- `providers/torznab.rs` + `newznab.rs` — `from_utf8_lossy().to_string()` on every XML element replaced with `&[u8]` pattern matching; `mem::take` replaces clones on push
- `server/scheduler.rs` — N+1 queries per monitored book replaced with 2 batch `SELECT DISTINCT` queries
- `server/import.rs` — `get_book_by_id` (loads 19 fields) replaced with `get_book_title` (1 field)
- `server/db.rs` — `serde_json::json!().to_string()` replaced with `format!()`
- `downloaders/transmission.rs` — `json::<Value>()` replaced with typed `#[derive(Deserialize)]` response structs

**Typestate pattern implemented (download pipeline):**
- `QueuedDownload → ActiveDownload → CompletedDownload → ImportingDownload → (ImportedDownload | FailedDownload)`
- Each transition consumes `self`, making illegal states unrepresentable at compile time
- `import::import_completed` now takes `&CompletedDownload` (not 4 raw params); callers cannot mismatch book_id/queue_id
- DB layer converts string status ↔ `QueueStatus` enum at the boundary

**Frontend SolidJS audit completed — fixes applied:**
- `App.tsx` — async `createEffect` replaced with `createResource`
- `Settings.tsx` — tab switch ternary replaced with `<Switch><Match>`
- `AuthorDetail.tsx`, `BookDetail.tsx` — `&&` for elements → `<Show>`, `.map()` → `<For>`

**Next priority:**
- System health checks / logging
- Calibre integration
- Bulk format conversion

**Note:** GoodReads metadata source is infeasible — Amazon deprecated the public API. Users can use the CSV import list (supports GoodReads export format) or OpenLibrary/Google Books instead.

**Stretch goals (post-MVP):**
- Multi-user + reading lists
- Gazelle/MAM indexers
- SABnzbd downloader
- Calibre integration (import from Calibre library)
- Bulk format conversion (ebook-convert / ffmpeg)

## Infrastructure

### Vite+ Migration ✅

**Done:**
- `flake.nix` — added `nix-vite-plus` input; `vp` binary available via `nix develop`
- Vite upgraded from 5.4 → 8.1.5, Vitest from 3.2 → 4.1.10
- `vp migrate --no-interactive` rewrote config, scripts, and imports
- `vite.config.ts` now imports from `vite-plus` and uses `lazyPlugins` for solid plugin
- Scripts use `vp` commands (`vp dev`, `vp build`, `vp test`, `vp check`)
- Formatter (oxfmt) fixed all files; linter (oxlint) caught 11 unhandled Promise issues + 1 unused var
- `vp check` (fmt + lint + typecheck), `vp test` (4 pass), `vp build` (Rolldown, 765ms) all green

### Notifications System ✅

**Done:**
- `crates/db/migrations/002_notifications.sql` — notification connections table
- `crates/server/src/notifications.rs` — `NotificationManager` with `load_from_db`, `send_to_all`, `send_to`; `AppriseNotificationService` impl (HTTP POST to webhook URL, event types: grab/import/upgrade/health/test)
- `crates/server/src/api/notifications.rs` — full CRUD + test endpoint at `/api/v1/notifications`, follows same pattern as settings/indexers API
- Wired into `DownloadManager` — sends `NotificationEvent::Grab` on release download and `NotificationEvent::Import` on import completion
- `NotificationManager` stored in `AppState` as `Arc<tokio::sync::Mutex<...>>`, shared with `DownloadManager`
- Frontend: `NotificationsTab` added to Settings page alongside Indexers and Download Clients, with add form, list, event toggles, test button, remove

## Ongoing Practices

### Typestate Pattern (Rust)

Use the typestate pattern in Rust for stateful operations where invalid states should be caught at compile time:

**Implemented:**
- Download pipeline stages: `QueuedDownload → ActiveDownload → CompletedDownload → ImportingDownload → (ImportedDownload | FailedDownload)` in `crates/core/src/models.rs`
- Each transition consumes `self` — illegal states are unrepresentable at compile time
- `QueueStatus` enum replaces raw string status at the DB boundary
- `crates/server/src/import.rs::import_completed` takes `&CompletedDownload` — callers cannot mismatch book_id/queue_id
- External download removal uses `client-not-found → Failed` status transition for proper error handling
- Scheduler jobs: `TypedJob<Idle> → TypedJob<Running> → TypedJob<Idle>` via `try_start/complete/fail` with `Arc<JobSharedState>`, prevents overlapping runs
- Book/Author monitoring: `MonitoredBook`/`UnmonitoredBook` and `MonitoredAuthor`/`UnmonitoredAuthor` wrapper types with `Deref<Target=Book/Author>`; `.into_monitored()` converts at compile time

**Still to apply:**

### Frontend Code Style (SolidJS, not React)

The frontend uses SolidJS, **not React**. All code must follow SolidJS conventions:
- **No hooks** — Solid uses signals, not `useState`/`useEffect`. Use `createSignal`, `createEffect`, `createMemo`.
- **No JSX conditional rendering with `&&` or ternary for elements** — Use Solid's built-in control flow:
  - `<Show when={condition}>` instead of `{condition && <Component/>}`
  - `<Switch><Match when={condition}>` instead of nested ternaries or ternary chains producing JSX
  - Exception: simple ternaries choosing between two string values (`condition ? "A" : "B"`) are fine — no perf difference
  - `<For each={list}>` instead of `{list.map()}`
  - `<Index each={list}>` for index-based rendering
- **No destructuring props** — Pass props directly, use `props.something` not `const { something } = props`
- **Reactivity** — Functions that access signals are automatically reactive; wrap in `createMemo` for derived values
- **No `useCallback`/`useMemo`** — Solid doesn't need these; use `createMemo` instead
- **No context providers with `createContext`** — Use Solid's `createContext` + `useContext` pattern (correct but different from React)
- **Batching** — `batch()` for multiple signal updates, not React's automatic batching

### Periodic Code Audit

Schedule periodic audits covering:

1. **Rust: Performance & Memory**
   - Eliminate unnecessary `clone()` calls — prefer `Arc`, references, or `Cow`
   - Check for large allocations in hot paths (DB queries, search scoring, import)
   - Audit `Box<dyn Trait>` heap allocations — consolidate where possible
   - Review `serde_json::Value` usage — prefer typed structs to avoid extra allocations
   - Check `sqlx` query patterns — use `query_as` with typed structs, avoid `query_unchecked`
   - Profile with `cargo flamegraph` / `cargo llvm-lines` / `perf`

2. **Rust: Security**
   - Verify all user input is validated at API boundary
   - Check for path traversal in file operations (import, library paths)
   - Audit dependency `cargo audit` / `cargo deny`
   - JWT: validate expiry, use `Validation::default()` not custom weak validation
   - Ensure argon2 parameters are not weakened
   - SQL injection: sqlx parameterized queries only (already enforced)

3. **Frontend: Performance**
   - Check for unnecessary re-renders — Solid doesn't re-render by default, but `createEffect` with stale deps can cause wasted work
   - Verify `<For>` and `<Index>` are used correctly with stable keys
   - Audit bundle size with `vite-bundle-visualizer`
   - Check TanStack Query cache invalidation patterns

4. **Frontend: Security**
   - No raw `innerHTML` or `dangerouslySetInnerHTML` equivalents
   - Validate all API response shapes at the boundary
   - XSS prevention through Solid's default escaping
   - Sanitize any user-displayed strings from indexer results

## Key Design Decisions

1. **SQLite over Postgres** - Zero-config for self-hosted users, sqlx gives compile-time checks
2. **TOML config over DB config** - Easier to manage in containers, git-ops friendly
3. **Trait-based providers** - New indexers/downloaders/metadata sources can be added as crates
4. **Stateless backend** - JWT auth, horizontal scaling ready if needed
5. **Push via WebSocket** - Real-time UI updates (download progress, import events)
6. **Rust std::future (tokio)** - Full async throughout for efficient provider/IO concurrency
7. **Trunk-based Cargo workspace** - Each provider type is a separate crate for compilation isolation
8. **Config directory** - XDG-compliant (`~/.config/readingroom/`)

## Key Rust Crates (Tentative)

```toml
[dependencies]
axum = "0.7"                    # HTTP framework
tokio = { version = "1", features = ["full"] } # Async runtime
serde = { version = "1", features = ["derive"] } # Serialization
serde_json = "1"                # JSON
toml = "0.8"                    # TOML config parsing
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite"] } # Database
reqwest = { version = "0.12", features = ["json", "rustls-tls"] } # HTTP client
tower-http = { version = "0.5", features = ["cors", "fs", "trace"] } # HTTP middleware
tracing = "0.1"                 # Structured logging
tracing-subscriber = { version = "0.3", features = ["env-filter"] } # Logging
jsonwebtoken = "9"              # JWT auth
tokio-cron-scheduler = "0.11"   # Background job scheduler
feed-rs = "2"                   # RSS/Atom feed parsing
strsim = "0.11"                 # String similarity for fuzzy matching
uuid = { version = "1", features = ["v4"] } # IDs
chrono = { version = "0.4", features = ["serde"] } # Date/time
```
