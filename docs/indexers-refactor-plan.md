# Indexers settings page — Solid 2.0 idiomatic reimplementation plan

**Goal:** rework `frontend/src/routes/settings/indexers.tsx` (1004 lines) to match the
idiomatic patterns demonstrated in `references/solidjs-2.0-optimistic-affordances/`
(the canonical `createOptimisticStore` + `action` + `refresh` resource-module pattern)
and the Solid 2.0 docs (`docs/actions-optimistic-assessment.md`, v2.solidjs.com).

**Reference pattern** (`references/solidjs-2.0-optimistic-affordances/src/todos.ts`):
a **resource module** that owns one optimistic store plus a bag of `action`s, and
returns `[store, actions]`. The component is a thin renderer: it reads the store and
calls actions. All mutation state lives in the store as data (`pending`, `error`),
not in parallel signals.

---

## 1. Current-state audit

### 1.1 State inventory (today)

| # | State | Kind | Problem |
|---|-------|------|---------|
| S1 | `indexers` | `createOptimisticStore` (async projection) | ✅ correct core |
| S2 | `erroredIndexers` | **plain module-level mutable object** (`Record<number, Indexer>`) | ❌ non-reactive side-channel mutated inside actions; folded back into the projection via a closure — invisible to devtools, survives HMR oddly |
| S3 | `indexerTestResults` | `createStore<Record<number, TestResult>>` | ◐ per-id test status is fine as a store, but it's written from *inside other actions* and read via `indexerTestResults[idx.id]` everywhere |
| S4 | `autoTested` | `createSignal(false)` | ❌ one-shot latch driven by a `createEffect` (see E1) |
| S5 | `isTestingAll` | `createOptimistic(false)` | ✅ correct |
| S6 | `adding`, `savingId`, `retryingId` | separate `createSignal`s | ❌ in-flight flags as scattered signals instead of store fields / `isPending` |
| S7 | `actionError` | `createSignal<string \| null>` | ◐ ephemeral error channel — fine, but duplicated per-action try/catch boilerplate |
| S8 | `addStep` | `createSignal<0\|1\|2>` | ◐ wizard step machine as a number signal |
| S9 | `editingId` + `editForm` + `editPluginSettings` | signal + signal + signal trio | ❌ three coupled signals must be kept in sync manually (set/cleared together in 3 places) |
| S10 | `newIndexer` | `createStore` (fixed shape) | ◐ draft form state outside any action transaction |
| S11 | `pluginSettings` | `createSignal(map)` | ◐ same, for plugin params |
| S12 | `implementations` | `createMemo(async)` + `loadingValue: null` | ✅ correct |
| S13 | `selectedImpl` / `editingImpl` / `implementationList` / `labelFor` | derived memos | ✅ correct |

### 1.2 Action inventory (today)

| Action | Pattern today | Issues |
|--------|---------------|--------|
| `removeIndexer` | `action` + optimistic filter + manual `erroredIndexers` bookkeeping + `refresh` | close to reference; error bookkeeping is a side-channel |
| `retryRemoveIndexer` | duplicate of remove minus optimistic delete | duplicates `removeIndexer`; exists only because errors live outside the store |
| `addIndexer` | `action(async function*)` with **two full copies of the body** (plugin vs core), valibot parse inline, `await` before first `yield` (no optimistic write), then signal resets | no optimistic add; validation mixed into the action; branch duplication |
| `updateIndexer` | `action`, but reads form state from three signals passed in; plugin/core split again | form extraction lives at call site |
| `testIndexer` | `action` writing per-id results into `indexerTestResults` | fine, but result shape could live on the indexer row |
| `testAllIndexers` | `action` looping with staggered delays calling `testIndexer` | OK |

### 1.3 Effect inventory

| Effect | Issue |
|--------|-------|
| E1: auto-test on first load (`createEffect(() => indexers.indexers, list => …)`) | one-shot imperative kick — legitimate boundary, but the latch (`autoTested`) + timers could be `onSettled` |
| E2: none other | — |

### 1.4 UI structure

- Step 1/step 2 add wizard inline in the tab component (~110 lines of JSX).
- Per-row edit form inline in the `<For>` (~70 lines).
- Two near-duplicate config-field components (`IndexerConfigFields`, `PluginConfigFields`) selected by a `Show`.
- Patch-adapter shims at every call site to bridge the two form shapes
  (`get={() => ({ name: newIndexer.name, settings: pluginSettings(), … })}` + 20-line
  `patch` closures) — the biggest source of noise.

---

## 2. Target architecture

### 2.1 Extract a resource module: `frontend/src/resources/indexers.ts`

Move all data + mutations out of the route file, mirroring `todos.ts`. Unlike the
reference (which keeps its `Errors` map at module scope), **`rowErrors` lives inside
`createIndexers()`** — it is per-store lifecycle state, not global: each mounted
store owns its failures, nothing leaks across remounts/HMR, and the garbage-collector
reclaims it with the store.

```ts
// resources/indexers.ts
import { action, createOptimisticStore, refresh } from "solid-js";
import * as v from "valibot";
import * as settingsApi from "../api/settings";

// Derived from the real API response — stays in sync automatically.
type ServerIndexer = Awaited<ReturnType<typeof settingsApi.listIndexers>>["indexers"][number];

export type RowError = { op: "add" | "update" | "remove"; args: unknown[] };

// Server row + optimistic affordances.
export type IndexerRow = ServerIndexer & {
  pending?: boolean;
  error?: RowError;
};

export function createIndexers() {
  // Failed-persist bookkeeping — INSIDE the factory so it shares the store's
  // lifecycle and is only ever touched by the actions below.
  const rowErrors = new Map<number, RowError>();

  const [indexers, setIndexers] = createOptimisticStore<{ indexers: IndexerRow[] }>(
    async () => {
      const data = await settingsApi.listIndexers();
      return {
        indexers: data.indexers.map((i) => {
          const err = rowErrors.get(i.id);
          return err ? { ...i, error: err } : i;
        }),
      };
    },
    { indexers: [] },
  );

  const actions = {
    remove: action(function* (row: IndexerRow) {
      setIndexers((s) => {
        s.indexers = s.indexers.filter((i) => i.id !== row.id);
      });
      try {
        yield api.removeIndexer(row.id);
        rowErrors.delete(row.id);
      } catch {
        rowErrors.set(row.id, { op: "remove", args: [row] });
      }
      refresh(indexers);
    }),

    retry: action(function* (row: IndexerRow) {
      const err = rowErrors.get(row.id);
      if (!err) return;
      yield actions[err.op](...(err.args as [IndexerRow]));
    }),

    add: action(function* (draft: FormValues) {
      const tempId = -Date.now();                       // negative = not yet persisted
      setIndexers((s) => {
        s.indexers.push({
          id: tempId, name: draft.name, implementation: draft.implementation,
          settings: draft.settingsJson, enable_rss: draft.enable_rss,
          enable_search: draft.enable_search, priority: draft.priority,
          pending: true,
        });
      });
      try {
        const saved = yield api.addIndexer({
          name: draft.name,
          implementation: draft.implementation,
          url: draft.url,
          api_key: draft.api_key,
          enable_rss: draft.enable_rss,
          enable_search: draft.enable_search,
          pluginSettings: draft.pluginSettings,
        });
        setIndexers((s) => {
          const i = s.indexers.findIndex((x) => x.id === tempId);
          if (i >= 0) s.indexers[i] = { ...saved, id: saved.id };
        });
      } catch {
        rowErrors.set(tempId, { op: "add", args: [draft] });
      }
      refresh(indexers);
    }),

    update: action(function* (id: number, draft: FormValues) {
      setIndexers((s) => {
        const row = s.indexers.find((x) => x.id === id);
        if (row) {
          row.name = draft.name;
          row.enable_rss = draft.enable_rss;
          row.enable_search = draft.enable_search;
          row.priority = draft.priority;
          row.pending = true;
        }
      });
      try {
        yield api.updateIndexer(id, { ...draft.toInput() });
      } catch {
        /* optimistic write reverts to server state */
      }
      refresh(indexers);
    }),
  };

  return [indexers, actions] as const;
}
```

Key moves:
- **`rowErrors` moves inside `createIndexers()`** — store-scoped, touched only by
  actions, projected back in the async projection (the reference's `Errors` map
  pattern, but properly scoped).
- `retryRemove` collapses into a generic `retry(row)` that replays the failed op
  (reference's `retryTodo`).
- `add` becomes a real optimistic transaction (temp row → reconcile to saved), which
  today's version lacks entirely.

### 2.1b Types are inferred from their sources of truth

No hand-written duplicates of wire shapes:

| Type | Derived from |
|------|--------------|
| `IndexerRow` | `Awaited<ReturnType<typeof settingsApi.listIndexers>>["indexers"][number] & { pending?: boolean; error?: RowError }` |
| `ImplementationInfo` | already exported by `api/settings.ts` (it *is* the wire type) |
| `TestResult` | UI-only shape — stays defined in the resource module |
| `FormValues` | draft shape; the core subset can use `v.InferOutput<typeof CORE_SCHEMA>`, plugin `settings` stay a dynamic map |

Rule of thumb: if a type describes what the **backend returns**, infer it from the
api module (`Awaited<ReturnType<…>>`); if it describes a **draft** or a UI-only
affordance, define it where it's used. When the backend adds a field, the frontend
type follows with no edit.

### 2.2 Test results live in the same module

The per-indexer test status map moves into `createIndexers()` too, as a plain store
plus two actions — so the route file holds zero mutation logic:

```ts
// still inside createIndexers()
const [testResults, setTestResults] = createStore<Record<number, TestResult>>({});

const test = action(function* (id: number) {
  setTestResults((r) => { r[id] = { status: "testing" }; });
  try {
    const data = yield api.testIndexer(id);   // generator: yield works on promises
    setTestResults((r) => {
      r[id] = { status: data.success ? "success" : "error", message: data.message };
    });
  } catch (e) {
    setTestResults((r) => {
      r[id] = { status: "error", message: e instanceof Error ? e.message : "Test failed" };
    });
  }
});

const testAll = action(function* () {
  for (const idx of indexers.indexers) {
    try { yield test(idx.id); } catch { /* recorded by test */ }
    yield new Promise((r) => setTimeout(r, 200));   // keep the stagger
  }
});
```

Return shape becomes `[indexers, testResults, actions]` (or fold `testResults` into
the returned object). The auto-test-on-load kick moves to `onSettled` in the route:

```ts
onSettled(() => {
  const timers = indexers.indexers.map((idx, i) =>
    setTimeout(() => void test(idx.id), i * 300));
  return () => timers.forEach(clearTimeout);
});
```

(deleting the `autoTested` latch + the two-arg `createEffect` boundary).

### 2.3 Validation with valibot

`import * as v from "valibot"` (v1.4 — see https://valibot.dev/llms.txt) stays the
single validation mechanism, in two layers:

**Core implementations** keep a static schema (as today):

```ts
const CORE_SCHEMA = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "Name is required")),
  url: v.pipe(v.string(), v.trim(), v.url("Must be a valid URL")),
  api_key: v.optional(v.string()),
});
```

**Plugin implementations** get their schema generated dynamically from the
implementation's declared `params`, so new plugins validate with zero frontend code:

```ts
function paramSchema(p: ImplementationInfo["params"][number]) {
  switch (p.type) {
    case "number":  return v.optional(v.number());
    case "boolean": return v.optional(v.boolean());
    case "select":  return p.options.length
      ? v.optional(v.picklist(p.options as [string, ...string[]]))
      : v.optional(v.string());
    default:        return v.optional(v.string());   // string | password
  }
}

function implSchema(impl: ImplementationInfo) {
  return v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1, "Name is required")),
    ...Object.fromEntries(impl.params.map((p) => [p.name, paramSchema(p)])),
  });
}
```

**Where validation runs:** on the draft, before the action fires —

```ts
const parsed = v.safeParse(implSchema(impl), draft);
if (!parsed.success) {
  const issue = parsed.issues[0];
  setError(`${v.getDotPath(issue)}: ${issue.message}`);   // e.g. "url: Must be a valid URL"
  return;
}
void add(draft);
```

`parsed.output` is the typed, trimmed/coerced draft that goes into the action. The
backend re-validates plugin settings against `params` (defence in depth) — the
frontend check exists purely for fast feedback and to gate the Save button
(`parsed.success` replaces the manual `pluginComplete()` / `!newIndexer.url.trim()`
checks).

### 2.4 Draft-form state: keep it out of the resource module

The add/edit **drafts are local editing sessions**, not server state. Per the docs
("Use a plain signal or store when the local value has an independent lifetime"),
they stay in the component — but unified:

- One `FormValues` shape for both core and plugin implementations:
  `{ name, implementation, url, api_key, enable_rss, enable_search, priority, settings }`
  where `settings` is the dynamic param map (empty for core types).
- One writable-derived signal seeded from the row being edited:
  `const [draft, setDraft] = createSignal(() => initialFormValue)`.
- This deletes the `newIndexer` store + `pluginSettings` signal + `editForm` +
  `editPluginSettings` quartet and their patch-adapter shims.

### 2.3 Unify the two config-field components

`IndexerConfigFields` and `PluginConfigFields` merge into one `IndexerConfigFields`
that takes the `ImplementationInfo` and renders:

- common fields (name, type label, url, api key when the impl wants one),
- generated param fields from `impl.params` when `impl.plugin`,
- capability-gated RSS/Search toggles from `impl.supports_rss` / `supports_search`,
- optional priority.

The hardcoded `wantsApiKey() => impl !== "rss"` / `wantsRss() => impl !== "anna"`
special-cases disappear: core implementations get explicit `params` entries in
`core_implementations()` (backend) / the static fallback list (frontend), so the
form is fully data-driven for every implementation.

### 2.4 Actions become transactions with optimistic writes

| Action | New shape |
|--------|-----------|
| `add` | validate (valibot schema built from the impl's params) → `setIndexers(s => s.indexers.push({ ...draft, pending: true }))` → `yield api.add(...)` → reconcile saved row → `refresh(indexers)`; on failure the optimistic row auto-reverts (or keeps `error` for retry) |
| `update` | `setIndexers` patch the row + `pending: true` → `yield api.update(...)` → reconcile → `refresh` |
| `remove` | unchanged (already canonical) |
| `test` / `testAll` | write `testing` onto the row (or keep the side map inside the module) |
| `retry` | replay the stored failed op (reference `retryTodo`) |

In-flight flags (`adding`, `savingId`, `retryingId`) become **fields on the rows**
(`pending`) or `isPending(action)` — deleting the parallel-signal sync problem.
`isTestingAll` stays `createOptimistic(false)`.

### 2.5 Wizard + edit state

- `addStep` becomes a small typed union signal (`"closed" | "pick" | "configure"`)
  — clearer than `0|1|2`.
- Edit mode: replace the `editingId` + `editForm` + `editPluginSettings` trio with a
  single `editing: createSignal<{ id: number; draft: FormValues } | null>(null)`.
  Open = set both; cancel/save = clear both. The `useBeforeLeave` guard reads
  `editing()`.

### 2.6 Loading/pending affordances

- Keep `<Errored>` around the list; the projection's async load drives it.
- Row-level `pending` renders the existing disabled/spinner states directly from
  data (`idx.pending`), matching the reference's `todo.pending`.
- `affects(indexers)` + `refresh(indexers)` in mutating actions where a reload
  should read as pending (per the affects doc) — optional polish after the main
  refactor.

---

## 3. File plan

| File | Change |
|------|--------|
| `frontend/src/resources/indexers.ts` | **new** — store + actions + test-results + types (`IndexerRow`, `TestResult`, `FormValues`) |
| `frontend/src/routes/settings/indexers.tsx` | **rewrite** — thin renderer: wizard, list, forms; drafts stay local |
| `frontend/src/api/settings.ts` | minor: `ImplementationInfo` gains `params` for core types (or frontend static params for core), so the form is fully data-driven |
| backend `core_implementations()` | optional: give core implementations `params` entries so the API-driven form covers them (removes the last hardcoded field special-cases) |

---

## 4. Migration steps

1. Create `resources/indexers.ts` with the store + `remove`/`retry` (port
   `erroredIndexers` into the Errors-map pattern). Wire the route to it; delete the
   side-channel and `retryRemoveIndexer`.
2. Port `test`/`testAll` into the module (keep the side map internal); move the
   auto-test kick to `onSettled` and drop `autoTested`.
3. Convert `add`/`update` to optimistic transactions over the shared `FormValues`
   draft; delete `adding`/`savingId` signals in favour of row `pending` /
   `isPending`.
4. Merge the two config-field components into one data-driven component; give core
   implementations params entries.
5. Tidy: typed wizard-step union, single `editing` signal, delete dead code
   (`anna` special-cases, `NEW_INDEXER_SCHEMA` core-only literals).
6. Verify: `vp check`, `vp test`, `vp build`; manual pass — add core indexer, add
   plugin indexer, edit both, remove (incl. failed-remove retry), Test All, auto-test
   on load, navigation guard.

---

## 5. Acceptance criteria

- No mutation logic in the route file; the route only reads store + calls actions.
- No parallel in-flight signals for operations that have a row (`pending` on the row).
- No non-reactive side channels except the documented Errors map, touched only by actions.
- No `createEffect` except the auto-test boundary (or it moved to `onSettled`).
- Both core and plugin config forms render from one data-driven component.
- Failed removes/adds surface a Retry affordance from store data.
- All existing behaviour preserved (wizard, edit-in-place, test-all staggering,
  nav guard, plugin params).
