# Idiomatic SolidJS 2 patterns for API-backed pages

Advice for building data-driven pages in this codebase (Solid 2 RC, file-system router,
`api/*` client modules). It captures the patterns that emerged from refactoring an
overgrown route into a resource module plus focused components; each section states the
pattern, why, and what it replaces.

**Worked example:** the indexers settings page applies every pattern here —

- `frontend/src/resources/indexers.ts` — resource module (server state, actions,
  validation, draft helpers)
- `frontend/src/components/settings/` — leaf/composite components (`IndexerCard`,
  `IndexerEditPanel`, `IndexerConfigFields`, `ImplementationPicker`)
- `frontend/src/routes/settings/indexers.tsx` — route reduced to view state + layout

Read those files alongside this doc; the snippets below are simplified versions of them.

---

## Data patterns

### 1. Resource-module hook: `const [data, actions] = createThing()`

Put server-backed state in a factory that returns `[projectedData, actionBag]`:

```ts
const [items, { add, update, remove }] = createItems();
```

Routes should own **only view state** (which panel is open, which row is selected, the
draft being typed into). Everything the server can see lives in the resource module.
Benefits:

- The route reads like a table of contents for the page.
- The resource is testable without rendering.
- Other pages can reuse the same hook.

Rule of thumb: if a piece of state would survive a re-render of the whole route, or is
needed by an API call, it belongs in the resource module — not in a signal inside the
component.

### 2. `createOptimisticStore(async source)` as the authoritative server state

```ts
const [serverRows, setServerRows] = createOptimisticStore(
  async () => (await api.listThings()).things,
  [],
);
```

Mutations follow a fixed rhythm — mutate optimistically, yield the request, refresh to
settle:

```ts
const removeThing = action(function* (row: Row) {
  setServerRows((s) => { s.things = s.things.filter(i => i.id !== row.id); });
  try {
    yield api.removeThing(row.id);
    rowErrors.delete(row.id);
  } catch {
    rowErrors.set(row.id, { op: "remove", args: [row] });
  }
  refresh(serverRows);
});
```

This replaces parallel "in-flight" signals (`adding()`, `savingId()`, `retryingId()`).
Those are multiple sources of truth for one concept ("this op is running"), each needing
manual set/reset in `finally` blocks. With an optimistic store, in-flight-ness is *data
on the row* (`pending`) or handled by the store's optimistic machinery, not bookkeeping
scattered across handlers.

**Inserts: optimistic rows with temp ids.** Adds follow the same rhythm, but there's no
existing row to mutate — push one with a synthetic id derived from the current time
(negative, so it can't collide with server ids) plus `pending: true`; `refresh` then
swaps in the real row from the server response:

```ts
const addThing = action(function* (input: Input) {
  const tempId = -Date.now();
  setServerRows((s) => {
    s.things.push({ id: tempId, ...input, pending: true });
  });
  yield api.addThing(input);
  refresh(serverRows);
});
```

Don't wait for the request before showing the result — the row appears immediately,
marked pending, and settles into its real identity when the store refreshes.

### 3. Layer local affordances with `createProjection` instead of polluting server rows

Client-only state (per-row errors, transient flags, locally-computed values) should never
be written into the server-shaped store, and never merged during refetch. Keep it in its
own primitive and layer it on read:

```ts
const rowErrors = new Map<number, RowError>();      // touched only by actions
const [testResults, setTestResults] = createStore<Record<number, TestResult>>({});

const things = createProjection(
  () => ({
    things: serverRows.things.map(row => ({
      ...row,
      error: rowErrors.get(row.id),
      test: testResults[row.id],
    })),
  }),
  { things: [] },
);
```

Layering on read means overlays survive refetches, stay reactive, and can carry rich
values (a typed error object with the failed op's args for retry) rather than lossy
booleans. Contrast with the smell this replaces: a plain object consulted *inside the
store's fetcher*, mapping rows to `{ ...i, error: true }` at fetch time — non-reactive,
lost on shape changes, and forcing extra signals for anything downstream.

### 4. Infer wire types from the API; derive view types from them

```ts
type ServerRow = Awaited<ReturnType<typeof api.listThings>>["things"][number];
type StoredRow = Omit<ServerRow, "serverOnlyField"> & { pending?: boolean };
export type ProjectedRow = StoredRow & { error?: RowError; test?: TestResult };
```

Never hand-redeclare what the `api/*` layer already types. Derive each layer from the
one below it so a backend shape change surfaces as a compile error here, not a runtime
bug.

### 5. Pure transformation helpers for row → draft → input round-trips

Forms that edit server rows need three shapes: the stored row, the editable draft, and
the API input. Write those conversions as pure exported functions in the resource module
— never inline them in event handlers:

```ts
// row (+ stored JSON blob) -> editable draft, with defaults applied
export function draftFor(def: Def, row?: Row): Draft { ... }

// draft -> API input shape
export function toInput(def: Def, draft: Draft): Input { ... }
```

Benefits: components stay free of parse/merge logic; the round-trip is symmetric and
visible in one place; the helpers are unit-testable without rendering. The anti-shape
this replaces: dozens of lines of `JSON.parse`/schema-fallback/default-merging pasted
into an Edit button's `onClick`.

### 6. Wrap schema-validation results in a friendly discriminated shape

Don't make every caller dig through the schema library's raw result object. Wrap once in
the resource module:

```ts
export function validateDraft(def: Def, draft: Draft) {
  const parsed = v.safeParse(schemaFor(def), { name: draft.name, ...draft.values });
  if (!parsed.success) {
    return { success: false as const, error: parsed.issues[0]?.message ?? "Invalid" };
  }
  return { success: true as const, output: parsed.output };
}
```

Callers get `{ success: true, output } | { success: false, error }` — no
`.issues[0]?.message` plumbing repeated at each call site, and the `as const` gives
call-site narrowing for free.

---

## Organization patterns

### 7. One concern per file; extract when JSX nests past display logic

Split by *role*:

- **Resource module** (`resources/<thing>.ts`) — data, mutations, validation.
- **Leaf display components** — props in, markup out (a card, a badge).
- **Composite interactive components** — forms, pickers, panels; own no server data;
  receive state + callbacks.
- **Route** — composition, view state, layout.

A good extraction trigger: a `<For>` body containing a `<Show fallback={...}>` pair
(display vs edit form) means you have two components living inline. Files over ~500
lines or routes holding more than a couple of component definitions want splitting.

### 8. Pass stores down directly, not via `get()`/`patch()` accessor pairs

Avoid this prop style:

```tsx
<MyForm get={() => form} patch={(v) => setForm(s => ({ ...s, ...v }))} />
```

`Partial<T>` patches force callers into giant `if (v.x !== undefined)` merge blocks.
Solid stores support fine-grained mutation anywhere in the tree; hand the store and its
setter to the child and let it write granularly:

```tsx
<MyForm draft={draft} setDraft={setDraft} />
// child: props.setDraft(d => { d.field = v; })
```

Routing every change through a merge adapter throws away both type precision and
granularity.

### 9. Drive forms and visibility from declared capabilities, not hardcoded variants

When a page renders N variants of roughly the same entity (different backends, protocols,
plugins), don't write one form component per variant with string comparisons against ids
(`impl() !== "rss"`, `type === "legacy"`). Instead:

- Have one shared draft type covering common fields plus a dynamic map for
  variant-specific ones.
- Render fields from **declared field definitions** returned by the backend (name, label,
  type, required, options).
- Gate optional sections on declared **capabilities** on the definition object, not id
  matches.
- Generate a valibot schema from the same definitions so validation stays in sync with
  rendering.

Adding a new backend variant then requires zero frontend form/validation edits. If you
find yourself writing a second near-duplicate form component, stop and make the first one
data-driven.

### 10. Name your states; don't use magic numbers

`step: 0 | 1 | 2` → `"closed" | "pick" | "configure"`. Costs nothing, reads everywhere.

### 11. Preload route data at the route level

Declare `preload` in the route definition so fetches start before the component mounts,
rather than first firing on mount:

```ts
export const route = defineFileRoute("/things", {
  info: { label: "Things" },
  preload: () => {
    void api.listThings();
    void api.getDefinitions();
  },
});
```

Preload everything the page will need. Calls wrapped in the router's `query()`
(`api/books.ts` style) dedupe against later reads through the router cache; for plain
client functions preload still starts the work at navigation intent rather than mount.
Keep preload consistent per route — don't leave pages fetching only on first render.

---

## Smells to watch for

### JSX ternaries whose branches render elements

A ternary inside `{...}` may only produce **text nodes** on both sides:

```tsx
// ok — both sides are text:
<p>{saving() ? "Saving..." : "Save"}</p>
<button class={active() ? "bg-indigo-600" : "bg-gray-700"}>{label}</button>

// not ok — an element on either side:
{item.indexer ? <span>{item.indexer}</span> : <span>-</span>}
```

Element-vs-element and element-vs-null conditionals belong to control-flow components:

- One-sided (`else` renders nothing) → `<Show when={...}>` with `fallback` if needed.
- Two-sided elements → nested `<Show>`s, or restructure so the branch produces text.
- Three-plus ways → `<Switch>` with `<Match>` arms.

```tsx
// element-or-nothing:
<Show when={props.src} fallback={<Placeholder ... />}>
	{(src) => <img src={src()} alt={props.alt} />}
</Show>
```

Why: control-flow components own their reactivity (a plain ternary only re-evaluates
when the whole surrounding expression re-runs), they keep conditions readable at the
call site instead of buried mid-JSX, and they give every branch a name.

### `try/catch → null` inside `createMemo`, plus `loadingValue`

```ts
// Do not do this:
const config = createMemo(
  async () => {
    try { return await api.getConfig(); }
    catch { return null; }          // swallows the error
  },
  { loadingValue: null },           // conflates loading with failure
);
```

Two problems in one: the `catch` hides failures from the nearest `<Errored>` boundary
(so the user gets a silently wrong UI instead of a Retry affordance), and
`loadingValue: null` makes every consumer distinguish loading-vs-loaded by `=== null`
checks instead of letting primitives/boundaries handle it. Instead:

```ts
const config = createMemo(() => api.getConfig());
// errors propagate to <Errored>; absence falls back to a static default:
const list = createMemo(() => config()?.items ?? FALLBACK_ITEMS);
```

If you reach for `loadingValue`, treat it as a signal you actually want a different
structure: an error boundary for failure, a discriminated status for multi-state flows,
or a projection for derived views.

### Related smells

- **Async sources that return null for "nothing yet"** (`if (!q) return null`) — return an
  empty result shape instead so consumers read one non-nullable type; model "idle" vs
  "no matches" explicitly at the call site (e.g. gate the panel on the query), not inside
  the source. Reserve null for genuinely-absent entities.
- **Parallel in-flight signals** (`adding()`, `savingId()`) — replaced by `pending` on
  rows / optimistic store semantics (see §2).
- **Side-channel state merged during fetch** — replaced by projection layering (§3).
- **Accessor-pair props** (`get()` / `patch(Partial<T>)`) — replaced by passing stores
  down (§8).
- **String-matching on entity ids for capability checks** — replaced by declared
  capabilities (§9).
- **Conversion logic inline in event handlers** (`JSON.parse` + default-merging in an
  `onClick`) — replaced by pure helpers (§5).
- **Files >~500 lines / >2–3 components per route file** — split by role (§7).

---

## Checklist for new pages

- [ ] Server state lives in a `resources/<thing>.ts` factory returning `[data, actions]`.
- [ ] Source of truth is `createOptimisticStore(async fetch)`; actions mutate → `yield`
      api → `refresh(store)`; inserts push temp-id rows marked `pending`.
- [ ] Client-only affordances (errors, flags) layered via `createProjection`; never
      written into server rows.
- [ ] Wire types inferred from `api/*` via `Awaited<ReturnType<...>>`; view types derived
      with `Omit`/intersections.
- [ ] Row→draft→input conversions and validation wrappers are pure exported functions,
      not inline handler code.
- [ ] Async memos return empty result shapes, not null; "idle" states are gated in JSX.
- [ ] Route declares `preload` for everything its resource modules will fetch.
- [ ] No `try/catch → null` in memos; no `loadingValue`; errors reach `<Errored>`.
- [ ] JSX ternaries produce text on both sides at most; element branches use
      `<Show>`/`<Switch>`.
- [ ] No parallel in-flight signals; in-flight state is data (`pending`) or optimistic.
- [ ] Variant forms are data-driven from declared fields/capabilities; one shared draft
      type; schema generated per variant.
- [ ] Components passed stores/setters directly (no `get()`/`patch()` pairs).
- [ ] Route files hold only view state + layout; extracted components get their own
      files under `components/<area>/`.
