CREATE TABLE IF NOT EXISTS notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    implementation  TEXT NOT NULL,
    settings        TEXT NOT NULL DEFAULT '{}',
    on_grab         INTEGER NOT NULL DEFAULT 1,
    on_import       INTEGER NOT NULL DEFAULT 1,
    on_upgrade      INTEGER NOT NULL DEFAULT 1,
    on_health_issue INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
