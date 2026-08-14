# ReadingRoom Frontend — SolidJS 2.0 Audit Report

**Status:** Review complete — findings recorded, fixes planned
**Date:** 2026-08-13
**Scope:** All `frontend/src/**` vs. the official Solid 2.0 docs (`references/solidjs-2.0/documentation/solid-2.0/`) and examples (`references/solidjs-2.0/examples/`)

---

## Executive summary

The frontend is well-migrated. The async-data model is correct throughout: `createMemo(async)` reads only inside `<Loading>` boundaries, `refresh(memo)` for invalidation, `onSettled` for setup/teardown, two-arg split effects, `For`/`Show`/`Switch` used correctly. No leftover 1.x/React patterns (`createResource`, `batch`, `onMount`, TanStack Query, `.map()` for lists, `&&` for elements, JSX ternaries for element trees, props destructuring).

The two systemic gaps are **error handling**: zero `<Errored>` boundaries (a failed fetch halts reactivity) and all mutation handlers swallowing errors. Plus one infrastructure bug in the WebSocket reconnect logic.

## Legend
- **CRITICAL** — breaks the app / halts reactivity
- **MAJOR** — systemic correctness or UX gap
- **MINOR** — edge case, inefficiency, or consistency
- **SUGGESTION** — idiomatic improvement

---

## MAJOR

### M1. No `<Errored>` boundary anywhere
- **Where:** app-wide (`App.tsx` and all routes)
- **Problem:** A `createMemo` whose promise rejects, read under `<Loading>` without an `<Errored>` ancestor, throws `[REACTIVITY_HALTED]` and halts the reactive system. Any HTTP 500 / network failure bricks the page with no recovery UI.
- **Reference:** `examples/todos/src/app.tsx:133-140` wraps the whole app; RFC `05-async-data.md:270-296`.
- **Fix:** Wrap the app (or route content) in `<Errored fallback={(err, reset) => ...}>`. Add per-section boundaries where helpful.

### M2. All mutation handlers swallow errors
- **Where:** `handleAddAuthor`, `handleAddBook`, `handleSearchAll`, `handleSearchBook`, `handleDownloadRelease`, `handleRemove`, `handleDeleteIndexer`, `handleAddIndexer`, etc.
- **Problem:** `try { await api... } finally { setFlag(false) }` with no `catch` → failed POST/DELETE produces an unhandled promise rejection, silently resets the pending flag, UI never tells the user.
- **Reference:** `examples/todos/src/todos.ts:50-74,169-172` (per-item error + retry affordance).
- **Fix:** catch and surface the error (error record/signal + inline message), or co-write an error like the todos `Errors` map.

### M3. WebSocket reconnect race (`api/ws.ts`)
- **Where:** `api/ws.ts:6-43`
- **Problem:** `connect()` is unguarded. After a drop, `onclose` sets `ws = null` and schedules `setTimeout(connect, 5000)`; if `subscribe()` is called in that window it opens a second socket, and the pending timer opens a third. Multiple sockets dispatch every message twice; `refresh(queue)` fires twice per event; each `onclose` schedules its own reconnect.
- **Fix:** single-flight `connect()` guard (`if (ws || reconnectTimer) return`) + cancelable reconnect timer.

---

## MINOR

### m1. Books.tsx — eager empty-query fetch
`searchResults` memo has no empty-query guard → `/books/search?q=` fires on mount. Authors.tsx already guards (`if q empty return null`). Copy that guard.

### m2. Books.tsx — no per-search Loading
Search-results reads sit inside the page-level boundary, which does not flip back to fallback on a new pending read → no loading indicator while searching. Add an inner `<Loading>` around just the results region (Authors.tsx:55 has the correct pattern).

### m3. Wanted.tsx — `<Loading>` covers the header/buttons
The boundary wraps the page title + "Search All" button, so they don't render until data loads. Scope `<Loading>` around the data-dependent grid only (RFC `05-async-data.md:36-48`).

### m4. Shared pending flags (Authors, Books, AuthorDetail)
One `adding()`/`searching()`/`downloading()` disables all rows. Per-item pending (Wanted's `searchingBookId`, Queue's `removingId`) is the better pattern.

### m5. Activity.tsx — `<Show when={item.size}>` treats `0` as falsy
0-byte files never show the MB label. Use `when={item.size != null}`.

### m6. AuthorDetail.tsx — `author()?.id ?? 0` fallback
Silently substitutes `book_id: 0` when nothing matches; the fallback is the author id rather than a book id. Capture the id at scheduling time or drop the `0`.

### m7. Settings.tsx — auto-test `setTimeout` stagger leaks on unmount
Switching tabs mid-stagger still fires tests and writes results for a disposed component. Track ids and clear on cleanup.

### m8. Settings.tsx — `testAllIndexers`/`testAllClients` read possibly-pending memo in handler
If a refresh is in flight, `indexers()` is pending and the untracked read throws `NotReadyError`. Guard with `await resolve(() => indexers())` or disable the button while pending.

### m9. Settings.tsx — signal declaration ordering
`newName`/`newImpl` declared at the bottom after the handlers that reference them. Works but confusing; hoist to the top.

### m10. stores/index.ts — dead store + over-narrow type
`ui`/`setUI` exported but imported nowhere; `theme` typed as literal `"dark"`. Wire it up or remove; widen the type.

### m11. api/client.ts — header spread via type assertion
`...(init?.headers as Record<string, string>)` silently breaks on `Headers` instances. Merge through `new Headers(init?.headers)`.

### m12. api/client.ts — 401 hard reload
`window.location.href = "/login"` bypasses the SPA router, inconsistent with `auth.ts`'s `logout()`. Expose an `onUnauthorized` hook so the app layer routes without a full reload.

### m13. Queue.tsx — 5s poll redundant with WS push
Duplicate refreshes; keep one (or make WS the primary and poll a fallback).

### m14. api/ws.ts — `!` assertion + reconnect never stops
`listeners.get(event)!` avoidable; reconnect loop runs forever even with zero subscribers. Close the socket and cancel the timer when the listener map empties.

---

## SUGGESTIONS

### s1. Replace `!` non-null assertions with `<Show>` callback form (~30 sites)
All current `!` uses are safe (inside `<Show when={...}>` guards). The 2.0 `<Show>` function-child (narrowed accessor) form removes them:
```tsx
<Show when={author()}>
  {(a) => <span>{a().name}</span>}
</Show>
```
Files: Authors, AuthorDetail, Books, BookDetail, Wanted, Dashboard.

### s2. Memoize `parsedSettings()` (Settings.tsx)
`parsedSettings()` re-`JSON.parse`s on every render of each notification item. Extract to a `createMemo`.

### s3. (Optional) Consolidate mutations into `action(function* {...})`
Not required — plain async handlers are legal per RFC 06. `action()` batches writes into a transition and auto-reverts pending flags. Nice-to-have.

### s4. Keyed `<Show>` for `user()?.username` (Layout.tsx)
`<Show when={user()}>{(u) => <span>{u().username}</span>}</Show>` narrows the type and drops the `?.`.

### s5. Wider `theme` type / guard `localStorage` (auth.ts)
`typeof window !== "undefined"` guard on import-time `loadUser()`; widen `theme: "light" | "dark"` if the store is kept.

---

## Already correct (preserve)

- Whole `createMemo(async) + <Loading>` read model — no untracked async reads in the happy path
- Nested/isolated `<Loading>` boundaries in Authors.tsx
- Cascading async memo in AuthorDetail.tsx
- Per-item pending state in Wanted/Queue
- `onSettled` setup + returned cleanup in Queue.tsx (poll + WS)
- Split-effect auto-test in Settings.tsx (write in apply phase — verified legal)
- Correct `For`/`Show`/`Switch` usage throughout; plain `<a href>` nav (matches router 2.0 examples)
- Framework-agnostic `api/client.ts` and `api/ws.ts`
