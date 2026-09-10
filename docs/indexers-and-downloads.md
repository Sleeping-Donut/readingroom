# Indexers & the download flow

Operational notes for the indexer → download → import pipeline, and the
external services it talks to. Written after getting the LibGen flow working
end to end; keep it current when touching indexers/downloads.

## The pipeline

1. **Indexer search** — `POST /api/v1/search/indexers/books/:id` asks
   `SearchEngine` to query every configured indexer and returns scored
   `Release`s. Each release carries a `download_url` and a `download_type`.
2. **Send to download** — `POST /api/v1/search/indexers/download` calls
   `DownloadManager::download_release`, which picks the **first** configured
   download client, checks the protocol, and calls `add_release`.
3. **HTTP Direct client** (`crates/downloaders/src/http.rs`) — for
   `download_type = "Direct"`. If the URL path contains `/api/` or ends with
   `.json`, it first GETs the URL and resolves a JSON `download_url` field
   (used by Anna's Archive). Then it streams the resolved URL to disk.
4. **Import** (`crates/server/src/import.rs`) — scans the download directory
   for files whose extension is one of
   `epub mobi azw3 pdf mp3 m4b flac m4a aac ogg opus wma cue`, copies them into
   the library, and sets the book status to `have`. No compatible files is an
   error (queue → `failed`, book reset to `tracked`).

### Gotchas

- **File extension comes from the release.** A URL like `get.php?md5=…` has no
  useful extension, so `HttpDownloadClient` prefers `release.categories[0]`
  (the format) and only falls back to the URL. Otherwise files are saved as
  `.php` and the importer skips them.
- **Importer accepts a fixed extension list.** Formats outside it
  (`doc`, `txt`, `rtf`, `fb2`, `djvu`, `cbz`, `cbr`, …) download fine but are
  not imported. Prefer epub/mobi/azw3/pdf results.
- **Indexer changes hot-reload.** `SearchEngine` holds the indexer set behind a
  lock; `settings.rs` and `indexers_api.rs` rebuild it after every
  create/update/delete. No restart needed to pick up a new key or indexer.
- **Lua plugins live in the data dir, not the build.** The server loads plugins
  from `<data-dir>/plugins/`. Editing
  `crates/providers/lua_plugins/*.lua` in the repo does **nothing** until you
  copy the file there and restart:
  ```bash
  cp crates/providers/lua_plugins/*.lua <data-dir>/plugins/
  ```
- **`host.http_get(url, headers?)`** takes an optional header table (added for
  LibGen's `Referer`). Missing args become `nil` in mlua, so the one-arg form
  still works.

## Anna's Archive (currently not usable server-side)

- **`annas-archive.is` is a fraudulent clone, not a mirror.** Its own pages say
  direct delivery is "still being finalized" and route downloads to
  `/account`. Search works, but it links to `/books/<id>` (book ids, not md5s)
  and has no `/dyn/api/fast_download.json` (404).
- **Official mirrors are `annas-archive.gl`, `.pk`, `.gd`** (per their FAQ).
  All sit behind **DDoS-Guard**, which returns a 403 JS challenge to plain HTTP
  clients — the server cannot scrape their HTML search.
- **The fast-download API needs a paid membership.**
  `GET /dyn/api/fast_download.json?md5=<32-hex>&key=<key>` is reachable (the
  API path is exempt from DDoS-Guard), but a valid key that is not a member
  returns `403 {"error": "Not a member"}`. No key → `401 "Invalid secret key"`.
- `md5` must be the 32-hex **file hash**, not a book id (`400 "Invalid md5"`).
- **Net:** the AA plugin cannot complete a download server-side without (a) a
  paid membership and (b) a way to obtain md5s that isn't DDoS-Guard-blocked.
  A mirror-list/fallback option in the plugin would not change that.

## Library Genesis (working)

- **Host: `https://libgen.li`** (reachable; `.is/.rs/.st/.gs/.la` fail,
  `libgen.vc` exposes no download links).
- **Search:** `GET https://libgen.li/index.php?req=<url-encoded query>` returns
  HTML result rows.
- **Download:** `https://libgen.li/get.php?md5=<32-hex>` → 302 → CDN
  (`cdn*.booksdl.lc`) → `application/octet-stream`. Works with no headers.
- **Ads-only rows:** many rows only expose `/ads.php?md5=<md5>`. That page
  **requires a `Referer`** (without it libgen returns 0 bytes) and contains the
  real link `get.php?md5=<md5>&key=<KEY>`. That keyed URL downloads fine
  **without** a Referer. The plugin emits the `ads.php` URL as-is and the HTTP
  downloader resolves it at **download time** (`Referer` + link extraction), so
  search makes a single request and stays fast (~1s) instead of fetching up to
  20 ads pages sequentially (~53s).
- Plugin: `crates/providers/lua_plugins/libgen.lua`. Add it in
  Settings → Indexers (type "Library Genesis", base URL `https://libgen.li`).

## Reproducing the end-to-end flow

1. Settings → Indexers → add **Library Genesis** (`https://libgen.li`).
2. Add an author + book (metadata search), open the book.
3. Interactive Search → pick an **epub/mobi/pdf** release → Download.
4. Watch it: queue goes `queued → downloading → completed → imported`, the book
   status becomes `have`, and the file lands under the library root
   (`<root>/books/<book_id>/<book_id>.<ext>`).

Verified on `zwei`: LibGen mobi release → 1.69 MB file → imported,
book status `have`.
