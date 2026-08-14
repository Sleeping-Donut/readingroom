# Pending-State UI Affordances — Audit

**Date:** 2026-08-13
**Scope:** All async handlers/actions in `frontend/src/routes/*` and `components/*`

An audit of what UI affordances communicate "an async operation is in flight". Grouped by type with counts and representative snippets.

---

## 1. Button label swap — "Xing…" while pending **(11 uses)**

The most common pattern. A signal drives both `disabled` and the button text.

```tsx
// routes/Books.tsx:96
{addingId() === book.foreign_id ? "Adding..." : "Add"}
```

| File:Line | Snippet |
|-----------|---------|
| Authors.tsx:97 | `{addingId() === author.foreign_id ? "Adding..." : "Add"}` |
| Books.tsx:96 | `{addingId() === book.foreign_id ? "Adding..." : "Add"}` |
| AuthorDetail.tsx:116 | `{searching() ? "Searching..." : "Search Indexers"}` |
| Wanted.tsx:46 | `{searchingAll() ? "Searching..." : "Search All"}` |
| Wanted.tsx:100 | `{searchingBookId() === book.id ? "Searching..." : "Search & Download"}` |
| Login.tsx:79 | `{loading() ? "Loading..." : isRegister() ? "Register" : "Sign In"}` |
| Queue.tsx:158 | `{retryingId() === entry.id ? "Retrying..." : "Retry"}` |
| Settings.tsx:337 | `{retryingId() === idx.id ? "Retrying..." : "Retry"}` |
| Settings.tsx:728 | `{retryingClientId() === client.id ? "Retrying..." : "Retry"}` |
| Settings.tsx:1022 | `{props.retrying ? "Retrying..." : "Retry"}` |

## 2. `disabled` while pending **(20 uses)**

Always paired with #1 — every pending button is also disabled. Disabled styling via `disabled:bg-gray-700` (or the inherited `disabled:*` classes).

```tsx
// routes/Queue.tsx:155
disabled={retryingId() === entry.id}
class="... disabled:bg-gray-700"
```

| File:Line | Action |
|-----------|--------|
| Authors.tsx:94 | add author (per-row) |
| Books.tsx:93 | add book (per-row) |
| AuthorDetail.tsx:113 | search indexers |
| AuthorDetail.tsx:175 | download release (per-row) |
| Wanted.tsx:43 | search all |
| Wanted.tsx:97 | search & download (per-row) |
| Login.tsx:76 | login/register |
| Queue.tsx:155 | retry remove (per-row) |
| Settings.tsx:189 | test all indexers |
| Settings.tsx:236 | add indexer |
| Settings.tsx:289 | test indexer (per-row) |
| Settings.tsx:334 | retry indexer (per-row) |
| Settings.tsx:444 | save indexer edit (per-row) |
| Settings.tsx:590 | test all clients |
| Settings.tsx:637 | add client |
| Settings.tsx:702 | test client (per-row) |
| Settings.tsx:725 | retry client (per-row) |
| Settings.tsx:916 | add notification |
| Settings.tsx:1001 | test notification |
| Settings.tsx:1019 | retry notification |

## 3. `<Loading>` boundary with text fallback **(15 uses)**

For **initial data reads** (`createMemo(async)` + `<Loading>`), NOT mutations. Both page-level and inner (per-region) boundaries.

```tsx
// routes/Activity.tsx:12
<Loading fallback={<p class="text-gray-500">Loading...</p>}>
  ...
</Loading>
```

Inner "Searching..." variant — only Books has a dedicated inner read-loading:
```tsx
// routes/Books.tsx:58
<Loading fallback={<p class="text-gray-500 text-sm">Searching...</p>}>
```

| File:Line | Boundary |
|-----------|----------|
| Authors.tsx:59 | search results (inner) |
| Authors.tsx:118 | tracked authors (page) |
| AuthorDetail.tsx:84 | author (section) |
| AuthorDetail.tsx:188 | metadata books (section) |
| Activity.tsx:12 | history (page) |
| Calendar.tsx:34 | calendar (page) |
| Wanted.tsx:54 | wanted grid (page) |
| BookDetail.tsx:12 | book (page) |
| Books.tsx:35 | books list (page) |
| Books.tsx:58 | search results (inner) |
| Queue.tsx:103 | queue (page) |
| Dashboard.tsx:27 | stats (page) |
| Settings.tsx:182 | indexers (tab) |
| Settings.tsx:583 | clients (tab) |
| Settings.tsx:829 | notifications (tab) |

## 4. Pulsing status dot + "Testing…" label **(2 use-sites, renders per row)**

Settings test buttons — a yellow `animate-pulse` dot via `StatusDot` while the test is in flight, plus a label swap.

```tsx
// routes/Settings.tsx:30 (StatusDot)
class={["inline-block w-2.5 h-2.5 rounded-full shrink-0", { "animate-pulse": props.status === "testing" }]}
style={{ "background-color": props.status === "testing" ? "#eab308" : /* green/red/gray */ }}

// routes/Settings.tsx:293
<Show when={indexerTestResults()[idx.id]?.status === "testing"} fallback="Test">
  Testing...
</Show>
```

| File:Line | Use |
|-----------|-----|
| Settings.tsx:30, 293 | indexer test |
| Settings.tsx:707 | client test |

## 5. Ellipsis label — `"..."` **(1 use)**

AuthorDetail's download button uses a bare ellipsis instead of "Downloading…".

```tsx
// routes/AuthorDetail.tsx:178
{downloadingId() === index() ? "..." : "Download"}
```

---

## Observations

- **Zero spinners** — no `animate-spin` anywhere; all pending affordances are text-swap + disabled, or the pulsing test dot.
- **Pending flags are `createOptimistic`, not `createSignal`** — per RFC 06, process affordances ("saving…", disabled buttons) are co-written *optimistic booleans that auto-revert on settle*, not derived verdicts (`isPending`). Every pending flag was converted from `createSignal` (with manual `finally` reset) to `createOptimistic`, and its handler to `action(async function*)`, so the flag reverts automatically on success or failure — no manual reset. Exception: the test-result statuses and `actionError` banners stay `createSignal` because they are **persistent data** (analogous to the todos `Errors` side-channel), not process affordances — auto-revert would erase them.
- **Per-row vs single flag:** per-row keyed `createOptimistic` (`addingId === row.id`, `retryingId === entry.id`) for list rows; single `createOptimistic` booleans for one-button actions (Login, Wanted "Search All", AuthorDetail indexer search).
- **The optimistic deletes (Queue/Settings)** don't show a pending label on the primary button — the row disappears optimistically, so the pending state is implicit; only the errored-row **Retry** shows "Retrying…".
- **Consistency gaps:** AuthorDetail's download uses `"..."` instead of `"Downloading…"`; the `Loading` fallbacks are uniformly `"Loading..."` text (no skeletons/spinners).
