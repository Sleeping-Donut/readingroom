# ReadingRoom — Book Lifecycle & Download/Import Plan

A self-hosted ebook/audiobook manager. This plan breaks down the "tracked → getting → have"
lifecycle (like Radarr), reliable download clients, book indexers, download locations, and
import/renaming — the gaps called out in FEEDBACK.md.

## Goal

Every book has a lifecycle state, visible in the UI, that progresses automatically:

```
tracked (monitored, no file) → getting (release grabbed, downloading) → have (file imported to library)
```

Configurable download locations (root folders) and a Radarr-style naming format so imported
files land as `LIBRARY/AUTHOR_NAME/TITLE (AUTHOR).ext`.

## Current state (survey, 2026-08-16)

| Area | Status | Notes |
|------|--------|-------|
| Import pipeline | ✅ partial | `ImportManager` scans completed download dirs, copies into `library_root/books/{author_folder}/{filename}`, writes `book_file`/`edition`/`history`, OPF sidecar. Rename via `library.book_file_format`/`author_folder_format` (placeholders: `{book_id}`, `{book_title}`, `{quality}`, `{format}`, `{ext}`). **No `{author_name}` placeholder, no author name passed in.** |
| Download pipeline | ✅ partial | `DownloadManager` sends release → client, creates queue row, polls completion, triggers import. States live in the `queue` table (`queued/active/completed/...`) and `queue_status`. |
| Book state | ❌ none | Books table has `monitored` only. "Have" is implied by existence of `book_files`; "getting" is implied by an active `queue` row. No explicit lifecycle state surfaced to the UI. |
| Download locations | ◐ toml only | `library.root_folder` / `audiobook_folder` in `config.toml`. Not editable from Settings. No per-format (ebook/audio) separation configured in UI. |
| Download client test | ❌ flaky | `POST /settings/downloadclients/:id/test` calls `client.get_config()`. Users report the same client Radarr uses failing — host/url parsing is fragile (see §2). |
| Indexers for books | ◐ | `torznab`, `newznab`, `rss` hardcoded; `anna` hardcoded (working, scrapes current `/books/<id>-<slug>` HTML). Plan: move `anna` → Lua plugin, keep core three hardcoded (§7). |
| Naming format | ◐ | Rename patterns exist but lack `{author_name}` and a Settings UI; no Radarr-style "path/to/AUTHOR/TITLE (AUTHOR).ext" preset. |

---

## §1 Book lifecycle states

### 1.1 Data model

Add a `status` column to `books` (migration `003_book_status.sql`):

```sql
ALTER TABLE books ADD COLUMN status TEXT NOT NULL DEFAULT 'tracked';
-- 'tracked' | 'getting' | 'have'
```

Derivation rules (keep it consistent, avoid drift):
- `have` — book has ≥1 row in `book_files` (imported file exists). Highest priority.
- `getting` — no files AND an active/queued/in-progress row in `queue` for this book.
- `tracked` — otherwise (monitored, nothing downloaded yet).

Enforcement points:
- On import completion (`import.rs::import_completed`) → set `status = 'have'`.
- On grab (`downloads.rs` when a queue row is created) → set `status = 'getting'`.
- On queue removal/cancel with no files → back to `tracked`.
- `DELETE` a book's files → recompute (`have` only while files exist).

### 1.2 API

- Include `status` in `GET /books`, `GET /books/:id`, `GET /wanted`, `GET /authors/:id/books`.
- `GET /wanted` already lists monitored-without-files → keep (that is effectively `tracked`+`getting`); optionally add `?status=` filter.

### 1.3 Frontend

- Status badge on book cards/list rows: `Tracked` (gray/blue), `Getting` (amber, pulse when downloading), `Have` (green). Reuse the pattern from the "✓ Tracked" badge.
- Book detail: status pill next to title; Wanted page shows Getting state when a queue row exists.
- Style driven by the same Tailwind badge classes used elsewhere.

### 1.4 Acceptance

- Adding a book shows `Tracked`.
- Grabbing a release flips it to `Getting` (queue visible on /queue).
- Import flips it to `Have`; file listed on detail page.

---

## §2 Download client reliability (test + runtime)

### 2.1 The failure mode

`downloaders/*` builds URLs from `host`/`port`/`url_base` naively:

- `qbittorrent.rs`: `base_url() = "http://{host}:{port}"` — **ignores `url_base`**, and breaks if `host` already contains a scheme or `:port` (common when copying from Radarr). No `https`, no path base.
- `transmission.rs`: uses `host` + `url_base` (path) but scheme hardcoded `http`, and the RPC endpoint is `/transmission/rpc`; needs the `X-Transmission-Session-Id` handshake.
- `deluge.rs`: JSON-RPC at `/json` — check scheme/base handling.

User symptom: "added the same client my Radarr uses, fails on Test". Most likely causes:
1. `host` entered as `http://host` or `host:port` → malformed double scheme/port.
2. A reverse-proxy `url_base` (e.g. `/qbittorrent/`) ignored by qBittorrent path.
3. `https` required but hardcoded `http`.
4. Auth (qBittorrent needs a real `username`/`password`; Transmission auth off vs on).

### 2.2 Fix (shared normalization)

Add a small helper (e.g. `crates/downloaders/src/urlutil.rs`):

```rust
/// Normalize a host value into (host, optional scheme, optional base_path).
/// Accepts "host", "host:8080", "http://host:8080", "https://host:8080/sub".
fn parse_host(host: &str, port: u16) -> (String, String, String); // (scheme, host, base_path)
```

Apply in all three clients:
- Scheme: `http` default, `https` if host says so.
- If `host` already contains `:port`, don't double-append.
- Append `url_base` (with leading/trailing slash normalization) for qBittorrent and Deluge paths.
- Keep Transmission's session-id handshake.

### 2.3 Test endpoint

`test_download_client` already calls `get_config()`. With the normalization above it should succeed against a real client. Keep the response (`version`, `default_save_path`).

### 2.4 Verification

Add unit tests for `parse_host` (host-only, scheme, scheme+port, port-only, base path, https). Verify live against the user's qBittorrent/Transmission (the same one Radarr uses) from the remote box.

---

## §3 Indexers for books

### 3.1 What to add

For a self-hosted *arr stack the right answer is **Torznab pointed at Prowlarr/Jackett** — the user already runs Radarr, so they almost certainly have Prowlarr:

- Add a **Torznab** indexer in Settings: URL `http://<prowlarr-ip>:9696/<api>/torznab/...`, API key from Prowlarr.
- In Prowlarr, enable book-capable trackers:
  - **MyAnonamouse (MAM)** — the best dedicated e/audiobook tracker; private, invite-only.
  - **Bibliotik** — ebooks; private.
  - **libgen/Anna's Archive** via Jackett mirrors — public, lower quality.
- The existing `torznab` implementation supports search + RSS; feed the indexer with `t=search` and the book title/author.

### 3.2 Code

- No new indexer impl strictly required; Torznab covers it.
- (Nice-to-have) a dedicated `mam` indexer in `providers` later; not in this pass.

### 3.3 Docs

- Update README/Settings hint text: recommended "Torznab → Prowlarr", and which trackers carry books.

---

## §4 Download locations (root folders)

### 4.1 Config

Keep `config.toml` as the seed, but make library paths editable at runtime via the settings DB (`config` table), mirroring Radarr "root folders".

Settings API:
```
GET  /api/v1/settings/library   → { root_folder, audiobook_folder, rename_files,
                                    author_folder_format, book_file_format }
PUT  /api/v1/settings/library   → persists overrides to the `config` table (key "library")
```

At startup and on request, merge order: `config.toml` < DB override. Effective path resolution in `main.rs`/`ImportManager` reads the merged value.

### 4.2 ImportManager changes

- Resolve `library_root` from merged config at import time (not frozen at startup).
- Support **per-format roots**: ebooks → `root_folder`, audiobooks → `audiobook_folder`.

### 4.3 Frontend — Settings "Library" tab

Add a tab in Settings (next to Indexers/Clients/Notifications/Account):
- Root folder path (ebooks), audiobook folder path.
- `rename_files` toggle.
- Naming format inputs: `author_folder_format`, `book_file_format` + a live preview line, Radarr-style.

---

## §5 Naming / import formatting

### 5.1 Add `{author_name}` placeholder

- `import.rs::import_completed` already loads `book_title`; also load the author name (`db::get_book_author_name(book_id)`) and pass into `destination_path`.
- Add placeholder replacement: `{author_name}` → sanitized author name (same sanitizer as titles), and `{title}`/`{book_title}` keep working.

### 5.2 Radarr-style default

- Settings defaults:
  - `author_folder_format = "{author_name}"`
  - `book_file_format = "{book_title} ({author_name}).{ext}"`
  - → files land at `LIBRARY/AUTHOR_NAME/TITLE (AUTHOR).ext` (exactly the requested shape).
- Preserve existing `{book_id}`, `{quality}`, `{format}`, `{ext}` placeholders.

### 5.3 Preview

- Settings Library tab shows the resolved example path for the first book/author as the user edits the format strings.

---

## §6 Wiring & rollout order

1. Migration + model: `status` on books; recompute on grab/import/cancel. (Agent A)
2. `{author_name}` + per-format roots + merged library config + settings/library API. (Agent A)
3. Download client `parse_host` normalization + tests. (Agent B)
4. Frontend: status badges + Settings Library tab. (Agent C)
5. Docs: indexer guidance (Prowlarr/Torznab + book trackers). (Agent B)
6. Verify: `cargo check`/`cargo test`, `vp check`/`vp test`, deploy to `zwei`, end-to-end test
   (add book → grab → import → Have; test client against the real Radarr client).

## §7 Lua plugin indexers

Replace the "every indexer is a hardcoded Rust impl" model with a split: the core
protocol indexers (Torznab, Newznab, RSS) stay hardcoded; everything else (Anna's
Archive today, more later) becomes a **Lua plugin** loaded from a directory at
startup. A plugin defines its manifest, its configurable params (so the WebUI can
build a form for it), and its `search`/`rss_sync` logic.

### 7.1 Loading

- CLI flag `--plugin-dir <path>` (repeatable) + env `READINGROOM_PLUGIN_DIR`.
  Each occurrence adds a directory scanned for `*.lua` files, one plugin per file.
  Default: `$data_dir/plugins` if the directory exists.
- A `PluginManager` loads each file with a Lua runtime (`mlua`, `vendored` feature,
  no system-lua dependency), reads the plugin's manifest table, and registers it by
  its `name` (implementation id). Duplicate names → warn + skip (later files lose).
- Failure to load a plugin logs an error and skips that file; a broken plugin never
  takes down the server.

### 7.2 Plugin structure (one `.lua` file per plugin)

A plugin is a Lua file that returns a table:

```lua
return {
  name = "annas-archive",                       -- implementation id (indexers.settings.implementation)
  label = "Anna's Archive",
  version = "1",
  supports_search = true,
  supports_rss = false,

  -- Config form the WebUI renders for instances of this plugin.
  params = {
    { name = "url",      label = "Base URL", type = "string",  required = true,
      default = "https://annas-archive.is" },
    { name = "api_key",  label = "API Key",  type = "password", required = false },
    { name = "language", label = "Language", type = "select",
      options = { "any", "en", "de" }, default = "any" },
  },

  -- criteria: { query, author, title, isbn, limit } (strings/numbers or nil)
  -- returns a list of releases:
  --   { title, info_url, download_url, size (bytes), download_type, categories = {...} }
  search = function(self, criteria)
    local q = criteria.query or (criteria.author .. " " .. (criteria.title or ""))
    local html = host.http_get("https://" .. self.url .. "/search?q=" .. host.url_encode(q))
    -- ... parse with host string helpers or embed a tiny html/table parser ...
    return { { title = "Example - Book [epub]", info_url = "...",
               download_url = "...", size = 1234, download_type = "Direct" } }
  end,

  -- optional
  rss_sync = function(self) return {} end,
}
```

Supported param `type`s: `string`, `password`, `number`, `boolean`, `select`
(`options` + `default`). `required` gates the WebUI Save button.

### 7.3 Host API exposed to plugins

Plugins get a global `host` table (pure functions, no network surprise):

| function | behavior |
|----------|----------|
| `host.http_get(url)` | blocking GET with a timeout; returns body string or `nil, err` |
| `host.http_get_json(url)` | convenience: `http_get` + JSON decode |
| `host.url_encode(s)` / `host.url_decode(s)` | percent-encode/decode |
| `host.json_decode(s)` / `host.json_encode(v)` | JSON <-> Lua table (serde-backed) |
| `host.log(level, msg)` | level `"info"`/`"warn"`/`"error"`; routed to `tracing` |

### 7.4 `LuaIndexer` adapter

- `crates/providers/src/lua.rs` implements `readingroom_core::traits::Indexer`
  (async_trait) over a loaded plugin. Each instance owns its `mlua::Lua` state
  (`Lua` is `!Send`, so a per-instance state + `spawn_blocking` keeps the async
  runtime clear of blocking HTTP).
- `search(criteria)` → `spawn_blocking`: set `self` + `criteria`, call the plugin's
  `search`, decode the returned release tables into `Release`, map Lua `size`
  units/`download_type` strings to the domain model.
- `name()` returns the plugin label; `supports_search`/`supports_rss` from the manifest.
- Plugin config values come from `IndexerConfig.settings` (JSON keyed by param
  `name`, same table the WebUI already writes).

### 7.5 Wiring

- `from_config` consults the `PluginManager` first; unknown implementations fall
  back to the hardcoded `torznab`/`newznab`/`rss` match. `main.rs` builds the
  `PluginManager` from `--plugin-dir` and passes it where indexers are constructed
  (same place the search-engine indexer list is built today).
- `create_indexer`/`update_indexer` validate a plugin instance's `settings` against
  the plugin's `params` (required present, type-correct) and reject otherwise.
- New endpoint `GET /settings/indexers/implementations` returns the merged list
  (hardcoded + loaded plugins) with `{ id, label, supports_search, supports_rss,
  params }` so the WebUI can render the add-flow step-1 picker and step-2 form
  without hardcoding plugin knowledge in the frontend.

### 7.6 WebUI

- Settings → Indexers → Add: step 1 lists hardcoded types **plus** loaded plugins
  (from `/settings/indexers/implementations`). Step 2 for a plugin renders fields
  from its `params` (text/password/number/checkbox/select) instead of the fixed
  Name/URL/API-key fields; `enable_search`/`enable_rss` toggles still apply when
  the manifest advertises them.
- Edit reopens that param form pre-filled (same pattern as today).
- `implementationLabel`/`implementationHint` in `shared.ts` stay as the static
  fallback for the three core types; plugin labels come from the API.

### 7.7 Acceptance: Lua Anna's vs hardcoded Anna's

The refactor is proven by a **hermetic side-by-side test**:

1. Ship `crates/providers/lua_plugins/annas-archive.lua` — a faithful Lua port of
   the current Rust `AnnaIndexer` search (same selectors via host string helpers,
   same `/books/<id>-<slug>` parsing).
2. Test spins up a local mock HTTP server serving a canned Anna's search HTML
   fixture. It configures both the Rust `AnnaIndexer` and the `LuaIndexer`
   (plugin `annas-archive`, url = mock server) and runs the same query.
3. Assert the two produce equivalent results: same release titles, `info_url`s,
   `download_url`s, sizes, and formats. This also guards against site HTML drift —
   if the fixture matches the live site, a change that breaks parsing fails the
   comparison.
4. Manual E2E on `zwei`: add an Anna's plugin indexer in the WebUI (form built from
   `params`), run interactive search on a tracked book, confirm results match the
   hardcoded indexer's output.

Then remove the hardcoded `annas.rs` from `from_config` (keep the Rust impl as a
reference fixture until the test passes).

### 7.8 Rollout order

1. `mlua` dep + `PluginManager` (load dir, manifest + params parse, registry) + CLI flag. (Agent A)
2. `LuaIndexer` adapter + host API (`http_get`/`json`/`url_encode`/`log`) + `from_config` wiring. (Agent A)
3. `settings/indexers/implementations` endpoint + settings validation against params. (Agent A)
4. `annas-archive.lua` port + hermetic comparison test vs Rust `AnnaIndexer`. (Agent B)
5. Frontend: plugin params in the add/edit flow + implementation labels from API. (Agent C)
6. Remove hardcoded `anna` from `from_config`; deploy; E2E on `zwei`. (all)

## Ownership / delegation

- **Agent A (backend lifecycle + import + settings)**: `003_book_status.sql`, `db.rs` (status set/recompute, author-name query), `downloads.rs` (status on grab), `import.rs` (`{author_name}`, per-format roots, merged config), `settings.rs` (library GET/PUT), `main.rs` (merged library config), `wanted.rs`/`books.rs` (status in responses).
- **Agent B (download clients + indexer docs)**: `crates/downloaders/src/urlutil.rs` + qbittorrent/transmission/deluge, `test_download_client`, unit tests, README indexer guidance.
- **Agent C (frontend)**: status badges (book cards/detail/wanted/queue), Settings "Library" tab (root folders + naming + preview) wired to `settings/library` API.

## Status tracker

| Item | Status |
|------|--------|
| §1 Book lifecycle states | ▢ |
| §2 Download client normalization | ▢ |
| §3 Indexer guidance (Prowlarr/Torznab) | ▢ |
| §4 Download locations settings | ▢ |
| §5 Naming format + `{author_name}` | ▢ |
| §6 E2E verification on remote | ▢ |
| §7 Lua plugin indexers (PluginManager + LuaIndexer + Lua Anna's vs hardcoded) | ▢ |
