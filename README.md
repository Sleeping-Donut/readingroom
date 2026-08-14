# ReadingRoom

A self-hosted ebook and audiobook management server. Track authors and books, search indexers for downloads, send to download clients, and auto-import into your library.

Built with Rust (Axum + SQLite) and SolidJS (Vite+).

## Quick Start

### Prerequisites

- [Nix](https://nixos.org/download.html) with flakes enabled

### Quick Start (Development)

```bash
# Enter the development shell (all tools are provided by Nix)
nix develop

# Run database migrations (first run creates data dir + default config)
cargo run -- --data-dir ./localdump/datadir

# Terminal 1: Backend server
nix develop -c cargo run -- --data-dir ./localdump/datadir

# Terminal 2: Frontend dev server
cd frontend && nix develop -c vp dev
```

### Install via Nix

Three packages are provided:

| Package | Contents |
|---------|----------|
| `readingroom` (default) | Backend binary + built frontend, combined |
| `readingroom-server` | Rust backend binary only |
| `readingroom-web` | Built frontend static files |

```bash
# Build the combined package (backend + frontend)
nix build

# Run it
./result/bin/readingroom-server --data-dir /var/lib/readingroom

# Or run directly from the flake
nix run .# -- --data-dir /var/lib/readingroom

# Build individual pieces
nix build .#server
nix build .#web
```

The backend auto-detects the frontend assets via the `FRONTEND_DIST` env var (set by the combined package) or relative `frontend/dist` paths.

### NixOS Module

```nix
{
  imports = [ readingroom.nixosModules.default ];

  services.readingroom = {
    enable = true;
    package = pkgs.readingroom-server;  # or your flake's package
    port = 5299;
    dataDir = "/var/lib/readingroom";
    auth.enable = true;
    openFirewall = true;
  };
}
```

The backend serves the API at `http://127.0.0.1:5299`. The frontend dev server runs at `http://127.0.0.1:5173` with API requests proxied to the backend.

## Basic Usage

### 1. Configure an Indexer

Go to **Settings → Indexers** and add a Torznab or Newznab indexer (e.g., Jackett/Prowlarr). Provide the URL and API key.

### 2. Configure a Download Client

Go to **Settings → Download Clients** and add Transmission, qBittorrent, or Deluge. Click **Test** to verify connectivity.

### 3. Add an Author

Go to **Authors** → **Add Author**, search by name, and select from metadata results. The author and their books will be tracked.

### 4. Search for Books

Open an author's detail page and click **Search Indexers** to find releases. Click **Download** on a release to send it to your download client.

### 5. Automatic Import

When a download completes, ReadingRoom automatically imports the files into your library. Monitor progress on the **Queue** page.

### 6. Notifications (Optional)

Go to **Settings → Notifications** and add an Apprise webhook URL to receive grab/import notifications.

## Configuration

All configuration is in a TOML file at `{data_dir}/config.toml`. Key sections:

```toml
[server]
host = "127.0.0.1"
port = 5299
library_root = "/path/to/books"     # Where imported files go

[auth]
enabled = true                       # Enable JWT auth

[library]
rename_files = true
book_file_format = "{book_title}.{ext}"
author_folder_format = "{book_title}"
```

### Rename Pattern Placeholders

| Placeholder | Description |
|-------------|-------------|
| `{book_id}` | Database book ID |
| `{book_title}` | Book title (sanitized) |
| `{quality}` | Quality variant (EPUB, MP3, etc.) |
| `{format}` | File format (epub, mp3, etc.) |
| `{ext}` | File extension |

## Features

- **Author & Book Management** — Search, add, monitor authors and books via OpenLibrary or Google Books
- **Metadata Sources** — OpenLibrary (default, no key), Google Books (API key), Audible via audnex.us
- **Indexers** — Torznab, Newznab, RSS/Atom (compatible with Jackett/Prowlarr)
- **Download Clients** — Transmission, qBittorrent, Deluge
- **Import Pipeline** — Automatic scan, classify, rename, and import on download completion; ZIP extraction
- **OPF Metadata** — Sidecar metadata files written alongside imported ebooks
- **Bulk Import** — Import existing ebook/audio collections from disk
- **Calibre Import** — Import books from an existing Calibre library
- **Format Conversion** — Convert between ebook formats via `ebook-convert` (calibre) or audio via `ffmpeg`
- **CSV Import Lists** — Import from GoodReads CSV exports
- **Scheduler** — Automatic missing book search, download polling
- **WebSocket** — Real-time queue updates
- **Auth** — Optional JWT-based authentication
- **Backup/Restore** — Timestamped ZIP backups of the database
- **Health Checks** — System health endpoint with per-component status

## Architecture

```
┌──────────────────────┐     HTTP/WebSocket     ┌──────────────────────┐
│   SolidJS Frontend    │ ◄──────────────────────► │   Rust Backend (Axum) │
│   (Vite+ / Rolldown)  │                         │   (SQLite + sqlx)    │
└──────────────────────┘                         └──────────────────────┘
                                                           │
                                              ┌────────────┼────────────┐
                                              │            │            │
                                         Indexers    Metadata     Download
                                         Torznab     OpenLibrary  Clients
                                         Newznab     Google Books Transm.
                                         RSS         Audible      qBittorr.
                                                                   Deluge
```

## Development

### Project Structure

```
├── crates/
│   ├── server/            # Axum HTTP server, API routes, middleware
│   ├── core/              # Domain models, traits, error types
│   ├── db/                # SQLite schema + migrations
│   ├── providers/         # Indexer implementations
│   ├── metadata/          # Metadata source implementations
│   └── downloaders/       # Download client implementations
├── frontend/              # SolidJS SPA
└── flake.nix              # Nix devShell
```

### Key Commands

```bash
# Build backend
nix develop -c cargo build

# Run tests
nix develop -c cargo nextest run

# Frontend typecheck + lint
cd frontend && nix develop -c vp check

# Frontend tests
cd frontend && nix develop -c vp test

# Production frontend build
cd frontend && nix develop -c vp build
```

### Tech Stack

| Component | Choice |
|-----------|--------|
| Backend framework | Axum (Rust) |
| Database | SQLite + sqlx |
| Frontend | SolidJS + Vite+ |
| Styling | Tailwind CSS |
| State / data | TanStack Query |
| Metadata | OpenLibrary, Google Books, Audible |
| Indexers | Torznab, Newznab, RSS |
| Downloaders | Transmission, qBittorrent, Deluge |
| Scheduler | tokio-cron-scheduler |
