-- Initial schema: authors, books, editions, book_files, series, etc.

CREATE TABLE IF NOT EXISTS authors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    foreign_id      TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    sort_name       TEXT,
    biography       TEXT,
    image_url       TEXT,
    birth_date      TEXT,
    death_date      TEXT,
    genres          TEXT NOT NULL DEFAULT '[]',
    aliases         TEXT NOT NULL DEFAULT '[]',
    links           TEXT NOT NULL DEFAULT '[]',
    monitored       INTEGER NOT NULL DEFAULT 1,
    tags            TEXT NOT NULL DEFAULT '[]',
    last_info_sync  TEXT,
    added_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    foreign_id      TEXT NOT NULL UNIQUE,
    author_id       INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    clean_title     TEXT NOT NULL,
    description     TEXT,
    isbn            TEXT,
    isbn13          TEXT,
    asin            TEXT,
    pages           INTEGER,
    publisher       TEXT,
    publish_date    TEXT,
    image_url       TEXT,
    genres          TEXT NOT NULL DEFAULT '[]',
    ratings         REAL,
    language        TEXT NOT NULL DEFAULT 'en',
    monitored       INTEGER NOT NULL DEFAULT 1,
    any_edition_ok  INTEGER NOT NULL DEFAULT 1,
    last_search_at  TEXT,
    added_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS editions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id           INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    foreign_edition_id TEXT NOT NULL,
    isbn13            TEXT,
    asin              TEXT,
    title             TEXT NOT NULL,
    language          TEXT NOT NULL DEFAULT 'en',
    format            TEXT NOT NULL DEFAULT 'ebook',
    quality           TEXT,
    publisher         TEXT,
    pages             INTEGER,
    release_date      TEXT,
    image_url         TEXT,
    monitored         INTEGER NOT NULL DEFAULT 1,
    manual_add        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(book_id, foreign_edition_id)
);

CREATE TABLE IF NOT EXISTS book_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id      INTEGER NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    path            TEXT NOT NULL,
    size            INTEGER NOT NULL,
    quality         TEXT NOT NULL DEFAULT 'unknown',
    format          TEXT NOT NULL,
    media_info      TEXT,
    date_added      TEXT NOT NULL DEFAULT (datetime('now')),
    calibre_id      INTEGER,
    part            INTEGER,
    UNIQUE(edition_id, path)
);

CREATE TABLE IF NOT EXISTS series (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    foreign_series_id TEXT NOT NULL UNIQUE,
    title             TEXT NOT NULL,
    description       TEXT,
    numbered          INTEGER NOT NULL DEFAULT 1,
    work_count        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS series_book_links (
    series_id   INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    position    REAL,
    is_primary  INTEGER NOT NULL DEFAULT 1,
    sort        TEXT,
    PRIMARY KEY (series_id, book_id)
);

-- Provider/config tables

CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    implementation  TEXT NOT NULL,
    settings        TEXT NOT NULL DEFAULT '{}',
    enable_rss      INTEGER NOT NULL DEFAULT 1,
    enable_search   INTEGER NOT NULL DEFAULT 1,
    priority        INTEGER NOT NULL DEFAULT 0,
    tags            TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS download_clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    implementation  TEXT NOT NULL,
    settings        TEXT NOT NULL DEFAULT '{}',
    priority        INTEGER NOT NULL DEFAULT 0,
    tags            TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- History and queue

CREATE TABLE IF NOT EXISTS history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type      TEXT NOT NULL,
    source_title    TEXT,
    book_id         INTEGER REFERENCES books(id),
    edition_id      INTEGER REFERENCES editions(id),
    indexer         TEXT,
    download_client TEXT,
    download_id     TEXT,
    quality         TEXT,
    size            INTEGER,
    data            TEXT,
    date            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id         INTEGER REFERENCES books(id),
    edition_id      INTEGER REFERENCES editions(id),
    download_id     TEXT NOT NULL,
    download_client TEXT NOT NULL,
    title           TEXT NOT NULL,
    size            INTEGER,
    status          TEXT NOT NULL DEFAULT 'queued',
    progress        REAL NOT NULL DEFAULT 0.0,
    added_at        TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS blocklist (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_title    TEXT NOT NULL,
    indexer         TEXT,
    book_id         INTEGER REFERENCES books(id),
    quality         TEXT,
    date            TEXT NOT NULL DEFAULT (datetime('now')),
    message         TEXT
);

-- Scheduling

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name       TEXT NOT NULL UNIQUE,
    interval_secs   INTEGER NOT NULL,
    last_execution  TEXT,
    last_duration_ms INTEGER,
    enabled         INTEGER NOT NULL DEFAULT 1
);

-- Import lists

CREATE TABLE IF NOT EXISTS import_lists (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    implementation  TEXT NOT NULL,
    settings        TEXT NOT NULL DEFAULT '{}',
    enabled         INTEGER NOT NULL DEFAULT 1,
    root_folder     TEXT,
    monitor         INTEGER NOT NULL DEFAULT 1,
    quality_profile TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_list_exclusions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    foreign_id  TEXT NOT NULL,
    name        TEXT,
    UNIQUE(foreign_id)
);

-- Users

CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    email       TEXT,
    role        TEXT NOT NULL DEFAULT 'user',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_lists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'want_to_read',
    progress    REAL NOT NULL DEFAULT 0.0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, book_id)
);

-- Indexes

CREATE INDEX IF NOT EXISTS idx_books_author_id ON books(author_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(monitored);
CREATE INDEX IF NOT EXISTS idx_editions_book_id ON editions(book_id);
CREATE INDEX IF NOT EXISTS idx_book_files_edition_id ON book_files(edition_id);
CREATE INDEX IF NOT EXISTS idx_history_book_id ON history(book_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON history(date);
CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status);
