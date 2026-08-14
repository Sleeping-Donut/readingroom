# ReadingRoom — `action()` / Optimistic API Fit Assessment

**Status:** Investigation complete — deletes IMPLEMENTED + all pending flags converted to `createOptimistic` (2026-08-13)
**Date:** 2026-08-13
**Reference:** `references/solidjs-2.0/documentation/solid-2.0/06-actions-optimistic.md`, `05-async-data.md`, `examples/todos` (canonical action + optimistic store usage), and the ephemeral-error pattern from https://brenelz.com/posts/handling-errors-in-solid-2/

---

## 1. What the APIs offer

Solid 2.0's mutation story has three coordinated pieces:

| API | What it does |
|-----|--------------|
| `action(fn)` | Wraps a generator/async-generator mutation. Each invocation runs as a **transaction** — every signal/store write between `yield` points batches atomically. Returns a callable you use from event handlers. |
| `createOptimistic` / `createOptimisticStore` | Signals/stores whose writes are **optimistic**: they show the expected value immediately and **auto-revert when the transition settles or fails**. |
| `affects(target)` + `isPending(fn)` | Declares in-flight work will change data (makes a reload read as pending); `isPending` surfaces "a change is on the way" UI. |

The reference pattern (from `examples/todos/src/todos.ts`):
```ts
const [todos, setTodos] = createOptimisticStore(async () => api.getTodos(), []);

const removeTodo = action(function* (id: string) {
  setTodos(t => t.filter(todo => todo.id !== id));   // optimistic: disappears now
  try { yield api.removeTodo(id); } catch { /* record error */ }
  refresh(todos);                                     // reconcile with source of truth
});
```

## 2. Current app mutation inventory (post-migration)

| Mutation | Type | Current pattern |
|----------|------|-----------------|
| Queue `handleRemove` | DELETE queue item | plain async + `refresh(queue)` |
| Settings `handleDeleteIndexer/Client/Notification` | DELETE config row | plain async + `refresh(...)` |
| Settings `handleAdd/Update` (indexer/client/notification) | POST/PUT config row | plain async + `refresh(...)` |
| Authors `handleAddAuthor`, Books `handleAddBook` | POST search-then-track | plain async + `refresh(...)` + clear search |
| AuthorDetail `handleDownloadRelease` | POST send to client | plain async, no list refresh |
| AuthorDetail `handleIndexerSearch` | POST, result → signal | plain async |
| Wanted `handleSearchAll/SearchBook` | POST trigger search | plain async + `refresh(wanted)` |
| Settings `handleTestIndexer/Client/Notification` | POST test | plain async, sets status in results map |
| Login `handleSubmit` | auth | plain async (imperative) |

## 3. Fit analysis

### GOOD FIT — optimistic deletes (real UX win)

Queue remove + the three Settings delete handlers are the cleanest adoption. Today the item **lingers** until the `refresh()` round-trip returns; with `action()` + `createOptimisticStore` it **disappears instantly** and **reverts automatically on failure**, while the `catch` surfaces the error message. This is exactly the todos `removeTodo` pattern, and it's the one case where optimistic state provides genuine value (instant feedback on a destructive action).

### MARGINAL FIT — add operations (Authors/Books)

The server assigns IDs, so an optimistic insert must fabricate a record with a guessed/temp ID before the `await`. The UX gain is small: adding already closes the search panel, and the `refresh()` that follows is fast. The transaction-batching of `action()` is nice-to-have but the current plain handler is already legal and clear.

### POOR FIT — search triggers, tests, login

- **Wanted / AuthorDetail search triggers**: background server work; there's no list to optimistically update, and the "pending" is a per-button affordance already handled by signals.
- **Settings test buttons**: already optimistic in spirit — they set `{ status: "testing" }` then resolve to success/error. On failure the *desired* outcome is an error status (not a revert), so auto-revert would fight the UX.
- **Login**: imperative auth; no list mutation.

---

## 3b. Ephemeral-error pattern (brenelz.com — "Handling Errors in Solid 2.0")

A pattern worth adopting alongside the deletes: keep **failed mutations visible as ephemeral state** layered onto the optimistic store, surviving until retried. Errors live *under* the optimistic overlay (in the projection fn), so optimistic reverts don't erase them.

**The pattern** (from the article, same architecture as the todos `Errors` side-channel):

```ts
const erroredComments: Comment[] = [];  // non-reactive side-channel

const [optimisticComments, setOptimisticComments] = createOptimisticStore(
  async () => {
    const comments = await getComments(issueId);
    return comments
      .concat(erroredComments)                          // overlay failed items
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },
  []
);

const addCommentAction = action(function* (comment) {
  setOptimisticComments(c => { c.push(comment); });     // optimistic insert
  try {
    yield saveComment(issueId, comment);
  } catch {
    erroredComments.push({ ...comment, errored: true }); // keep it, marked
  }
  refresh(optimisticComments);
});

const retryComment = action(function* (comment) {
  try {
    yield saveComment(issueId, comment);
    erroredComments.splice(erroredComments.findIndex(c => c.id === comment.id), 1);
  } catch { /* leave errored */ }
  refresh(optimisticComments);
});
```

The UI marks failed rows (`errored` flag) and offers an inline Retry that removes the record from the side-channel on success. Key properties:

- **Errors are ephemeral until retried** — exactly the "existing until something is retried" semantics the user referenced.
- **Survive optimistic reverts** — the errored record lives under the optimistic layer, so a failed action's auto-revert doesn't drop the error marker.
- **Per-item retry** — each failed row gets its own Retry affordance.

### Fit for ReadingRoom

**SUITABLE — the 4 delete operations** (Queue remove + 3 Settings deletes). A failed delete auto-reverts, but the ephemeral-error overlay keeps the *row* visible with a "Failed to remove" marker + Retry button. The user can retry just that row after a network blip instead of hunting through a banner. This is the canonical value of the pattern and composes directly with §3's optimistic-delete adoption.

**OPTIONAL — Settings adds** (indexer/client/notification). Mirror the article's add-comment: on failure, keep the newly-added (unsaved) row in the list marked "Failed to add" with Retry. Adds complexity (a temp representation per item); only worth it if the add-form→list retry is genuinely wanted.

**NOT SUITABLE — tests, search triggers, login** (same reasons as §3: tests already have per-item status + manual retry; search/login have no list item to preserve).


### What about the NON-optimistic affordances?

- **`isPending()`** — RFC 06 is explicit that process affordances ("saving…", disabled buttons) are **co-written optimistic state, not verdicts**. Our explicit pending signals (`removingId`, `addingId`, `searching`) are the correct tool. `isPending` is for "a value change is in flight" (e.g. refetch on input change) — not needed here since our `refresh()` re-asks are intentionally quiet.
- **`affects(x); refresh(x)`** — would make a reload read as pending. Only useful if we add an "updating…" indicator on the Queue when WS pushes a change. Optional.
- **`latest()`** — for stale-while-revalidating during transitions; no current need.

## 4. Recommendation

**Adopt `action()` + `createOptimisticStore` + the ephemeral-error overlay for the 4 delete operations** (Queue remove + 3 Settings deletes). They are the clear fit: instant removal, auto-revert on failure, and — with the §3b pattern — a failed delete keeps the row visible with an inline "Failed to remove — Retry" affordance that survives until retried. This is the canonical 2.0 mutation UX (todos + the brenelz.com article).

> **Status: DONE (2026-08-13).** Implemented in `src/routes/Queue.tsx` (`remove`/`retryRemove` actions + `erroredRemovals`) and `src/routes/Settings.tsx` (`removeIndexer`/`retryRemoveIndexer`, `removeClient`/`retryRemoveClient`, `removeNotification`/`retryRemoveNotification` + per-tab `errored*` overlays). All reads converted to `createOptimisticStore`; errored rows show a red border + "Failed to remove — click Retry" + Retry button. Additionally, **all pending-state flags** (Login `loading`, Wanted `searchingAll`/`searchingBookId`, AuthorDetail `searching`/`downloadingId`, Authors/Books `addingId`, Settings `adding`/`isTestingAll`/`savingId`/`testingId`/`retrying*Id`) were converted from `createSignal` to **`createOptimistic`**, and their handlers to `action(async function*)` so the flags auto-revert on settle. Persistent data (`actionError`, test-result statuses) intentionally stays `createSignal` — those are the todos-style side-channel, not process affordances. `vp check` / `vp test` / `vp build` green.

**Leave everything else as plain async handlers.** They're legal per RFC 06, and converting adds/search/tests would be churn for marginal benefit. The Settings **add** operations are the only optional extension (article's add-comment pattern) — defer unless the add-form→list retry is wanted.

### Example change (Queue.tsx)

```tsx
// Row type gains an optional error marker
interface QueueEntry { ...; error?: boolean; }

// Failed removals, keyed by queue id — lives under the optimistic layer.
const erroredRemovals: Record<number, QueueEntry> = {};

// read: createMemo → createOptimisticStore (seed = empty shape)
const [queue, setQueue] = createOptimisticStore<{ queue: QueueEntry[]; total: number }>(
  async () => {
    const data = await api.get<{ queue: QueueEntry[]; total: number }>("/queue");
    return {
      ...data,
      // re-mark any rows whose delete failed
      queue: data.queue.map(e => (erroredRemovals[e.id] ? { ...e, error: true } : e)),
    };
  },
  { queue: [], total: 0 }
);

const remove = action(function* (entry: QueueEntry) {
  setQueue(s => { s.queue = s.queue.filter(e => e.id !== entry.id); }); // optimistic
  try {
    yield api.delete(`/queue/${entry.id}`);
    delete erroredRemovals[entry.id];
  } catch {
    erroredRemovals[entry.id] = entry; // keep the row, marked errored
  }
  refresh(queue);
});

const retryRemove = action(function* (entry: QueueEntry) {
  try {
    yield api.delete(`/queue/${entry.id}`);
    delete erroredRemovals[entry.id];
  } catch { /* leave errored */ }
  refresh(queue);
});
```

UI: an errored row renders "Failed to remove" + a Retry button (calls `retryRemove`) in place of the normal Remove button. Reads change from `queue().queue` to `queue.queue` (store access); the `<Loading>` boundary and `refresh(queue)` continue to work unchanged.

## 5. Files affected (if adopted)

| File | Change |
|------|--------|
| `src/routes/Queue.tsx` | read → `createOptimisticStore`; `handleRemove` → `remove` action; add `retryRemove` action + `erroredRemovals` overlay; errored-row UI; `queue()` → `queue.queue` |
| `src/routes/Settings.tsx` | three delete handlers → `action` + optimistic removal + `erroredRemovals` overlays on `indexers`/`clients`/`notifications` reads; per-row retry UI |

## 6. References

- RFC 06 — `references/solidjs-2.0/documentation/solid-2.0/06-actions-optimistic.md`
- RFC 05 — `references/solidjs-2.0/documentation/solid-2.0/05-async-data.md`
- Todos example (Errors side-channel + `action`) — `references/solidjs-2.0/examples/todos/src/todos.ts`
- Ephemeral-error pattern — https://brenelz.com/posts/handling-errors-in-solid-2/
