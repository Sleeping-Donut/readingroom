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
- **OPDS** - Import from other servers
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
- Per-user OPDS authentication

## Implementation Order

### Milestone 1: MVP ("Skeleton")
- [x] Nix flake (devShell + build)
- [ ] Cargo workspace with basic crate structure
- [ ] Axum server: health check, config loading, startup
- [ ] SQLite setup with sqlx + initial migration
- [ ] MetadataSource trait + OpenLibrary implementation
- [ ] Author/Book CRUD API endpoints
- [ ] SolidJS scaffold: routing, basic pages, API client
- [ ] Author search/add flow in UI

### Milestone 2: Search & Download
- [ ] Indexer trait + Torznab implementation
- [ ] Search engine with basic decision logic
- [ ] DownloadClient trait + Transmission implementation
- [ ] Download pipeline (send to client, track progress)
- [ ] Import pipeline (completed download → library)
- [ ] Search results UI, queue UI

### Milestone 3: Automation
- [ ] Scheduler with cron-like jobs
- [ ] RSS sync for indexers
- [ ] Automatic missing book search
- [ ] Post-processing (rename, metadata, cover)
- [ ] Wanted/Missing UI

### Milestone 4: Production Features
- [ ] Quality profiles + custom formats
- [ ] Notifications (Apprise, Telegram, Email, Webhook)
- [ ] GoodReads metadata source + import list
- [ ] Gazelle + MAM indexers
- [ ] qBittorrent + Deluge downloaders
- [ ] SABnzbd downloader
- [ ] Auth system (JWT, user management)
- [ ] Calendar view, activity history
- [ ] Backup/restore
- [ ] Multi-user with reading lists

### Milestone 5: Polish & Scale
- [ ] Google Books metadata source
- [ ] HardCover metadata source
- [ ] Newznab indexer
- [ ] Direct download indexer (Z-Library, Anna's Archive)
- [ ] Calibre integration
- [ ] OPDS catalog server
- [ ] Performance optimization, caching
- [ ] System health checks and logging
- [ ] Import lists (GoodReads shelves)
- [ ] Bulk import from existing collection

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
