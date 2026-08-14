# ReadingRoom Frontend — Solid 2.0 Idiomatic Audit Report

**Date:** 2026-08-14
**Based on:** [`docs/solid-v2-reference.md`](solid-v2-reference.md) (RC announcement + v2 docs), [`solid-v2-core.md`](solid-v2-core.md), [`solid-v2-ecosystem.md`](solid-v2-ecosystem.md)
**Scope:** All `frontend/src/**` — core/infra + 10 route files

---

## Executive summary

The codebase is already **strongly idiomatic Solid 2.0**: config-based router (`createRouter`/`defineRoute`), plain `<a>` router-delegated links, async `createMemo` + `<Loading>` reads, `action(async function*)` mutation handlers, `createOptimistic` pending flags, `createOptimisticStore` + non-reactive error maps + `refresh` (the documented "layer by lifetime" pattern), `onSettled` setup/teardown, two-arg split effects, object-form `class`, and a framework-agnostic API/WS layer. No 1.x leftovers (`createResource`, `batch`, `onMount`, `classList`, `solid-js/web`, `Suspense`, `Index`).

**One real bug was found**, plus a set of idiomatic improvements and ecosystem adoptions that would raise the bar further.

---

## 1. Bugs

### B1. Settings → NotificationsTab `adding` is a plain `createSignal` that never resets (HIGH)
- `src/routes/Settings.tsx` — `adding` (line ~741) is `createSignal(false)` (the sibling tabs use `createOptimistic`).
- `addNotification` sets `setAdding(true)` and **never resets it**. With `createSignal` the flag stays `true` forever after the first submit → the "Save" button (`disabled={adding() || !newName()}`) is **permanently disabled** on subsequent opens of the Add form.
- Fix: `createOptimistic(false)` — auto-reverts on action settle.

### B2. Settings → `testIndexer` / `testClient` are plain async handlers (MEDIUM, inconsistency)
- `src/routes/Settings.tsx` — these POST to a test endpoint and drive a process affordance (the `"testing"` status + disabled button) but are plain `async` functions with a manual flag inside a plain signal.
- `testNotification` in the same file already uses `action` + `createOptimistic` — the inconsistency is the tell.
- Fix: convert to `action(async function* (id) { …set "testing"…; yield api.post(...); …set success/error…; })` so pending state is transaction-coordinated. Keep the test **result** statuses in a persistent signal (they're data, not process affordances).

---

## 2. Strong recommendations (idiomatic improvements)

### S1. Per-route `<Title>` head metadata (all routes)
- No head tags anywhere; `index.html` hardcodes `<title>ReadingRoom</title>`.
- Add per-route `<Title>` — either `useHead({ tag: "title", ... })` from `@solidjs/web` (already a dep, **zero new packages**) or `@solidjs/meta` (component form). Later-wins + disposal-restores on navigation. Login is the natural first candidate (full-screen page).
- Static `<title>` in `index.html` correctly remains the fallback.

### S2. Local `<Errored>` around inline search panels (Authors, Books, AuthorDetail)
- Only App has a top-level `<Errored>`. A failed **search** (`/authors/search?q=`, `/books/search?q=`, `/search/indexers/...`) rejects up to the top-level boundary → the **whole app including nav** is replaced by the error card.
- Wrap each inline search/data region in its own `<Errored fallback={(err, reset) => ...}>` so a transient failure recovers independently while the shell stays alive.
- Same applies (lower severity) to Queue and the other single-fetch routes.

### S3. Books.tsx — Loading boundary scoping (HIGH UX)
- The **entire page** — heading, "Add Book" toggle, and the search form — is inside the grid `<Loading>`. The search UI is hidden behind "Loading…" until `/books` settles.
- Move the header + search panel above the grid's `<Loading>` (Authors.tsx already does this correctly).
- Same minor instance: BookDetail back-link and Calendar/Activity/Dashboard headings sit inside their `<Loading>` — hoist static chrome out.

### S4. Export the Router and use typed navigation (`Router.paths`)
- `Router` is created inline in `App.tsx` and not exported; no `Router.paths` usage anywhere.
- `export const Router = createRouter({...}); export const { paths } = Router;` unlocks typed URLs everywhere:
  - `navigate(Router.paths.login, { replace: true })` (App, Login, Layout logout)
  - `href={Router.paths.authors}` / `Router.paths.books(id)` in Layout + all route links
  - `useParams(Router.paths.authors)` typed params in AuthorDetail/BookDetail
- Plain `<a>` links are already correct; this only adds compile-time URL checking.

### S5. Active-link styling via `[aria-current]` / `[data-active]`
- Claimed anchors automatically get `aria-current="page"` (exact) and `data-active` (descendant) — the nav doesn't use them. Add CSS (e.g. `a[data-active] { color: indigo }`) instead of hover-only.

---

## 3. Opportunities (polish)

### O1. Router `query`/`revalidate` as a cache layer (Queue especially)
- `query(fn, key)` + `revalidate` from `@solidjs/router` gives a keyed cache shared across routes. Queue's poll+WS loop is the cleanest candidate: `const getQueue = query(fn, "queue")` read via `createMemo`; a WS message becomes `revalidate(getQueue.key)` — **no interval, no manual cache**. (Also: `checkAuthEnabled`/`system-status` could be a `query`.)
- Current async-memo-per-mount approach is functionally fine — this is an upgrade, not a defect.

### O2. `affects(x)` + `refresh(x)` for "updating…" indicators (optional)
- Bare `refresh()` is intentionally quiet (correct for background sync). If a "refreshing…" affordance is wanted (Authors add, Wanted search, Queue manual refresh), pair `affects(x); refresh(x)` and read `isPending(() => x)`. Button process affordances are already covered by `createOptimistic`.

### O3. `<Reveal>` for coordinated section reveal (AuthorDetail, Dashboard)
- AuthorDetail has two independent `<Loading>` sections (author + metadata books); `<Reveal order="natural">` (or `sequential`) would coordinate reveal. Dashboard cards are another candidate.

### O4. `createStore` for test-results records (Settings)
- `indexerTestResults` / `clientTestResults` are `Record<number, TestResult>` signals updated by spread; consumers read per-row. A `createStore` gives per-property tracking (only the affected row re-renders) and draft-first setters (`setResults(r => { r[id] = … })`).

### O5. `dynamic()` for Settings tabs (optional, no change required)
- Both `<Switch><Match>` and `dynamic(() => …)` are valid. Note: **both unmount the inactive tab**, so per-tab state (test results, edit forms, `autoTested`) resets on every switch — if retention matters, neither fixes it without hoisting state.

### O6. `useBeforeLeave` (Settings edit form)
- No dirty-form guard exists. Settings' inline `editForm` is the candidate: `useBeforeLeave` to warn/confirm on unsaved edits.

### O7. `Loading` `on` prop
- Not needed today (param-id changes already unsettle the source so fallback re-shows). Note as an available tool if any route later re-keys on an id change.

---

## 4. Ecosystem adoptions worth considering

| Ecosystem piece | Current state | Opportunity |
|---|---|---|
| `@solidjs/meta` (head) | not installed | Per-route `<Title>`/`<Meta>` (or `useHead` from `@solidjs/web` — zero deps) |
| `@solidjs/router` `query`/`revalidate` | unused | Keyed cross-route cache; Queue poll/WS → `revalidate`; auth status as `query` |
| `@solidjs/router` typed `paths` | unused (router not exported) | Typed navigation everywhere |
| Vite plugin **start mode** | not used (`solidPlugin()` plain) | Optional migration: `start: true` → generated entries, no `index.html`, head registry owned by plugin. **Not required** — the manual mount is valid for a static client app. |
| `@solidjs/vite-plugin` Oxc compiler | already default | Already on it (upgraded earlier) |

---

## 5. Minor / nits

- **Catch-path writes after `await`** (Authors, AuthorDetail, Books, Wanted, Settings adds/updates, Login): `setActionError(...)`/`setError(...)` in a `catch` writes a signal not written earlier, after a plain `await`. Doc idiom: bare `yield;` before the write (core.md:619). Practically benign for plain signals, but it's the documented transaction rule.
- **NotificationItem class ternary** (Settings ~980): `class={props.notif.on_grab ? "text-green-400" : "text-gray-600"}` ×4 → object form.
- **Queue row status class**: `class={\`text-xs font-medium ${statusColor(entry.status)}\`}` — string interpolation; object form preferred.
- **client.ts**: 401 fallback is a full reload (nearly dead since the hook is always registered); hook setter type `cb: () => void | null` should be `cb: (() => void) | null`; `res.json()` unguarded on 204/empty.
- **Queue first-load flash**: `createOptimisticStore(async, {queue:[],total:0})` seeds an immediate committed value, so `<Loading>` may never show — users see an instant "No active downloads." flash before the async result lands. Verify desired UX.
- **Queue remove failure gap**: between the failed DELETE and `refresh`, the row is momentarily invisible. Optional: restore it into the store optimistically on catch.

---

## 6. Priority order

1. **B1** — NotificationsTab `adding` → `createOptimistic` (bug fix)
2. **B2** — `testIndexer`/`testClient` → `action` (consistency)
3. **S3** — Books.tsx Loading scoping (UX)
4. **S2** — local `<Errored>` around search panels
5. **S1** — per-route `<Title>` (via `useHead`, zero deps)
6. **S4 + S5** — export Router, typed `paths`, active-link styling
7. **O1–O7** — query/revalidate, affects/isPending, Reveal, store-for-results, dynamic(), useBeforeLeave
8. **§5 nits** — as time allows

---

## 7. What's already right (preserve)

- Optimistic pending discipline (`createOptimistic`) in 8 of 9 mutation sites; `action(async function*)` with correct `yield;` placement (optimistic write before first `await`; `yield;` after awaits, before writes).
- Settings `remove*`/`retry*` use `yield api.delete(...)` — the documented `yield promise` suspension.
- `createOptimisticStore(fn, seed)` + non-reactive `errored*` maps + `refresh` — verbatim the docs' layer composition.
- Queue: `onSettled` + cleanup for WS/poll; per-section `Loading`; the intentional-quiet `refresh` is correct.
- Two-arg compute/apply auto-test effect in Settings (legitimate imperative boundary).
- Class object form, plain `<a>` links, framework-agnostic API/WS layers, async-memo reads with inputs before `await`.
