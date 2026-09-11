# Audiobook support — plan

**Status:** planning only. Nothing here is implemented yet.

## Goal

Let ReadingRoom acquire **audiobooks** the same way it acquires ebooks: the same
authors and book entries, the same download clients, the same import pipeline —
but with indexers that can search audio, an audiobook metadata source, per-media
monitoring, and audio routed to the audiobook library folder.

## Non-goals (permanent — these will never become goals)

- A separate audiobook catalogue / separate author or book entities.
- Audio playback / streaming.
- Changing the download-client layer (a torrent/usenet client serves both media).
- Replacing the ebook flow.
- A separate route/page for audiobooks (they live as a **tab** on the book page).

## Guiding principle: one book, two media

A **Book** is the work ("The Caves of Steel"). It can have **ebook** editions
and **audiobook** editions. Authors and books are shared; only the *acquisition*
and *file/edition* layers become media-aware.

```
Author ──< Book{monitored, monitored_audiobook} ──< Edition{format: EBook|AudioBook} ──< BookFile
                     ▲
                     └── Search/Release/Queue carry a media type to pick the right side
```

## Decisions locked in

1. **Monitoring is split per media.** A Book carries independent ebook and
   audiobook monitoring flags. The single monitor button becomes **two** (one per
   media tab) so they can be monitored separately. The scheduler's
   "search missing" pass searches **only the media that are monitored**.
2. **Audiobooks are a tab, not a route.** `/books/:id` gets **Ebooks** and
   **Audiobooks** tabs; no `/books/:id/audiobooks` route.
3. **One indexer, multiple media.** A single indexer entry (and a **single Lua
   file per site**) declares the media it supports, e.g.
   `media = { "ebook", "audiobook" }`. We do **not** ship two Lua files per site.
4. **Audiobook metadata via a community Audible DB, reconciled through the
   Book.** Use a community Audible metadata database/API — preferred:
   **Audnexus** (`audnex.us`) — rather than scraping Audible directly. Audiobooks
   are **always discovered through the existing Book (OL entry)**: resolve the
   work from OL, then look up its Audible data and attach the audio editions
   under that Book. **Audible-only content that is not an adaptation of a tracked
   book is out of scope** — we never add audiobooks that don't reconcile to a
   Book. Reference: `references/LazyLibrarian` for audiobook fetching/naming
   (AudioBookBay indexer, `AUDIOBOOK_TYPE` mp3/m4b, `AUDIOBOOK_DEST_FILE`/`FOLDER`);
   it has no Audible metadata source, so that is net-new here.
5. **Audio quality profile.** Quality config gets an audio profile (preferred
   codecs/bitrates — e.g. M4B > FLAC/MP3, minimum bitrate), separate from the
   ebook profile.
6. **"Search missing" is a split button.** The Wanted page's single `Search All`
   button becomes a split button: the **main button searches both media** by
   default; a **dropdown arrow** opens a popover to run **books only** or
   **audiobooks only**. The hourly scheduler keeps searching per media.

## What already exists (reuse, don't rebuild)

| Piece | Where | Notes |
| --- | --- | --- |
| `EditionFormat::{EBook, AudioBook, Physical}` | `crates/core/src/models.rs` | already models audio editions |
| Audio `Quality::{MP3, M4B, FLAC}` | `crates/core/src/models.rs` | already present |
| `LibraryConfig::{root_folder, audiobook_folder}` | `crates/core/src/config.rs` | both folders already configured + shown in Settings → Library |
| `classify_file` + `is_audiobook_format` | `crates/server/src/import.rs` | already classifies audio extensions |
| `effective_library_config` | `crates/server/src/import.rs` | picks the library root at import |
| Download clients, queue, import manager | `crates/server/src/downloads.rs`, `crates/downloaders/` | media-agnostic |
| Authors, books, editions, metadata | `crates/server/src/api/{authors,books}.rs` | Book stays the shared anchor |

So the model, library settings, and import already have audiobook hooks — they
just aren't *driven* by a media type anywhere.

## Missing piece: a media-type dimension

Today nothing in the search path says "this is an audiobook". We add a
`MediaType` and thread it through five layers:

1. **Indexer capability** — which media an indexer can search.
2. **Search criteria** — which media this search is for.
3. **Release** — which media a result is (so the queue/import know).
4. **Queue / import** — where to import the file.
5. **UI** — which tab/action the user is in.

---

## Backend plan

### 1. Core model (`crates/core`)

- Add `MediaType { Ebook, Audiobook }` (`Serialize/Deserialize`, `Copy`).
  - Keep `EditionFormat` as the edition-level enum; `MediaType` is the
    *acquisition* axis. `Physical` has no acquisition, so it isn't a `MediaType`.
  - Add `EditionFormat::media_type()` and `Quality::media_type()` helpers.
- **Book monitoring split**: add `monitored_audiobook: bool` alongside the
  existing `monitored` (ebook). `into_monitored()` becomes media-aware (or add
  `into_monitored(media)` / `is_monitored(media)`).
- `SearchCriteria` (`traits.rs`): add `media_type: MediaType`.
- `Indexer` trait:
  ```rust
  fn supported_media(&self) -> &[MediaType] { &[MediaType::Ebook] }
  ```
  (default ebook keeps existing indexers working).
- `Release`: add `media_type: MediaType`.

### 2. Indexer config + plugin manifest

- `IndexerConfig` (`config.rs`): add
  ```rust
  #[serde(default = "default_media_types")] // ["ebook"]
  pub media_types: Vec<MediaType>,
  ```
- `ImplementationInfo` + `PluginDef` (`crates/providers/src/plugin.rs`): add
  `media_types: Vec<MediaType>`.
- **Lua manifest — one file per site, multi-media**:
  ```lua
  media = { "ebook", "audiobook" },  -- default { "ebook" }
  ```
  A plugin branches on the requested media (e.g. LibGen text vs audio collection;
  Anna's Archive likewise). One `libgen.lua`, not two.
- `build_indexers`: keep `media_types` on the built indexer so `SearchEngine`
  filters per request.

### 3. Metadata source (audiobook)

- Add an `Audible` metadata source backed by a **community Audible DB
  (Audnexus)** — not direct scraping — returning audiobook `Edition`s (narrator,
  runtime, ASIN, publisher, cover).
- **Reconciliation rule**: audiobooks are found *through the Book*. Resolve the
  work from OL first, then query Audnexus for that work and attach the audio
  editions to the **existing Book entry**. Audible-only titles that don't
  reconcile to a Book are **out of scope**.
- Wire it into the metadata dispatcher so the Audiobooks tab resolves audio
  editions for a book; keep OpenLibrary as the work/author source.
- Reference for audiobook fetching/naming: `references/LazyLibrarian`.

### 4. Search

- `SearchEngine::search_book(&self, book, media_type)`:
  - Skip indexers whose `supported_media()` lacks `media_type`.
  - Put `media_type` into `SearchCriteria`.
  - Keep the author-in-query behaviour.
- `search_author(author_id, media_type)` similarly.
- API: `POST /search/indexers/books/:id?media=ebook|audiobook` (default ebook),
  same for authors and the title search.
- **Wanted search**: the `/wanted/search` endpoint (and the scheduler's
  `search_missing_books`) takes an optional media filter — absent ⇒ **both**
  media (the split button's main action), present ⇒ that media only (the popover).
  The hourly scheduler searches both.
- Scoring: prefer releases whose `media_type` matches, and score audio formats
  (M4B/FLAC/MP3) via the audio quality profile.

### 5. Download + queue + import

- `Release` carries `media_type`; store it on the queue row.
- Queue table: add `media_type` (TEXT). Migration in `crates/server/src/db.rs`.
- Import: destination root from the queue entry's media type (falling back to
  `is_audiobook_format`):
  - `Ebook` → `library.root_folder`
  - `Audiobook` → `library.audiobook_folder`
- `ensure_edition` creates `EditionFormat::AudioBook` for audio.

### 6. Quality config (audio profile)

- `QualityConfig` (`config.rs`): add an audio profile alongside the ebook one:
  ```rust
  pub audio_profile: String,
  pub audio_custom_profiles: Vec<CustomProfile>,
  ```
  with audio qualities (M4B, FLAC, MP3) and a preferred order / minimum bitrate,
  surfaced in Settings.

### 7. DB migrations

- `indexers.media_types` (TEXT, JSON) — default `["ebook"]`.
- `books.monitored_audiobook` (INTEGER) — default `0`.
- `queue.media_type` (TEXT) — nullable for legacy rows.
- No change needed to `editions`/`book_files` (edition `format` and file `quality`
  already distinguish audio).

---

## Frontend plan

### 1. Book detail page (`frontend/src/routes/books/[...id].tsx`)

Restructure into two **tabs** — **Ebooks** and **Audiobooks**. Shared header
(title, author, cover, description) stays; everything acquisition-related is
per media. Each tab shows its own status, monitor toggle, actions
(Automatic + Interactive Search), editions list, and download/files status.

### 2. Component split

Make the media explicit; add audio equivalents.

| Today | Plan |
| --- | --- |
| `components/books/BookCover.tsx` | keep (media-agnostic) |
| `components/books/BookCard.tsx`, `BookRow.tsx` | keep for the catalogue |
| `components/books/StatusBadge.tsx` | parameterise: `StatusBadge({ status, media })` |
| `EditionRow` (in `books/[...id].tsx`) | split → `EbookEditionRow` / `AudiobookEditionRow` (audio: narrator, runtime, bitrate) |
| `ReleaseRow` (in `books/[...id].tsx`) | split → `EbookReleaseRow` / `AudiobookReleaseRow` |
| search modal (`Dialog`) | extract `MediaSearchDialog({ media })`; render one per tab |
| monitor button (bookmark) | split into two — one per media tab |
| `BookAction` (in `authors/[id].tsx`) | parameterise by media |

Suggested layout: `frontend/src/components/media/` for the parameterised
`MediaTabs`, `MediaSearchDialog`, `ReleaseRow`, `EditionRow`; keep
`components/books/*` for catalogue-level bits.

### 3. Search UX

- **Book page, per tab**: **Interactive Search** scoped to that media;
  **Automatic Search** scoped to that media.
- **Wanted page — "Search missing" split button** (`routes/wanted.tsx`): replace
  the single `Search All` button with a split button. The **main button searches
  both media** by default; the **dropdown arrow** opens a popover with
  **Books** / **Audiobooks** to run one media only. The per-book row action and
  the hourly scheduler also become media-aware.
- Download sends the release (carrying `media_type`) — no extra UI.

### 4. API client (`frontend/src/api/search.ts`, `api/wanted.ts`, `types/index.ts`)

- `searchIndexersForBook(bookId, media)`, `searchIndexersForTitle(query, media)`
  → `?media=...`
- `searchWantedAll(media?)` (omit ⇒ both media) and `searchWantedBook(id, media)`.
- Add `MediaType`, `Release.media_type`, `QueueEntry.media_type`,
  `Book.monitored_audiobook`.

### 5. Settings

- **Library**: both folders already exist; add an audiobook file/folder naming
  format (`audiobook_file_format`) mirroring `book_file_format`.
- **Indexers**: media-type checkboxes in add/edit, driven by the implementation's
  `media_types`; show supported media in the list.
- **Quality**: audio profile editor.

---

## Reuse summary

- **Authors / books / metadata anchor**: unchanged; a book gains audio editions
  and files alongside ebook ones.
- **Download clients / queue / import manager**: unchanged; media type only
  affects which indexers are searched and which folder receives the file.
- **Indexers**: one entry + one Lua file per site, declaring `media`.

## Phased delivery

1. **Core + indexers**: `MediaType`, `SearchCriteria.media_type`,
   `Indexer::supported_media`, `IndexerConfig.media_types`, plugin `media`,
   `Release.media_type`, split monitoring flags. Default ebook so nothing breaks.
2. **Search**: media-aware `SearchEngine`, API `?media=`, scoring preference.
3. **Queue + import**: `queue.media_type`, import to `audiobook_folder`, audio
   editions.
4. **Metadata**: Audible audiobook source linked under the OL book entry.
5. **Frontend**: media tabs, component split, two search dialogs, split monitor
   buttons, indexer media checkboxes.
6. **Quality/polish**: audio quality profile, audiobook naming format, narrator
   fields.

## Open questions

- **Audnexus matching key**: how do we go from an OL work to its Audnexus entry
  (title+author fuzzy match, ISBN, or an explicit id)? Do we ever need to fall
  back to the official Audible API for missing data?
- Audio quality profile shape: ordered codec list, minimum bitrate, or both?
