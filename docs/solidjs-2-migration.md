# ReadingRoom Frontend — SolidJS 2.0.0-rc Migration Assessment

**Status:** Assessment complete — no code migrated yet
**Date:** 2026-08-13
**Current version:** `solid-js` 1.9.x
**Target version:** `solid-js` 2.0.0-rc

---

## 1. Executive Summary

ReadingRoom's frontend is a small, well-scoped SolidJS SPA. The migration is **small in scope and the ecosystem is now ready to support it**. The previously-identified blocker — ecosystem compatibility — has been resolved:

- `@tanstack/solid-query` **6.0.0-rc.0** exists for Solid 2.0 (branch `solid-query-v6-pre`), **OR** we can drop TanStack Query entirely and use Solid 2.0's own async primitives (confirmed viable by the `hackernews-spa` example, which uses `createMemo(async)` with no query library).
- `@solidjs/router` **2.0.0-next.13** is the version used across the Solid 2.0 examples.
- `vite-plugin-solid` has moved to **`@solidjs/vite-plugin`** (as of `55570dc9`), version `3.0.0-next.28`, on the `babel-preset-solid` 2.0-rc toolchain — composes cleanly with Vite+ / Rolldown (see §7 for the verified detail).
- `@solidjs/testing-library` + the type-only tests are fine.

The main remaining decision is **whether to keep TanStack Query or replace it with Solid 2.0 async primitives** — that choice dominates the amount of manual work.

### Migration size (est.)
| Area | Files | Effort |
|------|-------|--------|
| Toolchain swap (`@solidjs/vite-plugin`) | `package.json`, `vite.config.ts` | Small |
| Imports / runtime packages | `index.tsx`, `stores/index.ts`, `tsconfig.json` | Small |
| JSX type system | `tsconfig.json`, all route files (type-level) | Small |
| `createResource` → async memo + `Loading` | `App.tsx` | Small |
| `createEffect` → split effects | `App.tsx`, `Queue.tsx` | Small |
| `classList` → `class` object | `Settings.tsx` | Tiny |
| Batching behavior verification | `api/auth.ts`, route state flows | Medium (behavioral) |
| Dev-diagnostics cleanup | all route files | Medium |
| Data layer: Option A (keep TanStack Query 6-rc) | none beyond bump | Small |
| Data layer: Option B (drop TanStack Query) | all 8 route files | Medium |

---

## 2. Current Stack Inventory

| Package | Version | Usage |
|---------|---------|-------|
| `solid-js` | ^1.9.0 | Core reactivity, control flow |
| `@solidjs/router` | ^0.14.0 | `App.tsx` router, `useLocation`, `useNavigate`, `RouteSectionProps` |
| `@tanstack/solid-query` | ^5.0.0 | `createQuery`/`createMutation`/`useQueryClient` in every route |
| `vite-plugin-solid` | ^2.11.13 | JSX compiler in `vite.config.ts` |
| `@solidjs/testing-library` | ^0.8.10 | Tests (currently only pure type tests use it indirectly) |
| `vite-plus` (Vite+) | catalog 0.2.6 | Build/dev tooling (`vp`) |

### Target versions (verified)
| Package | Target | Source |
|---------|--------|--------|
| `solid-js` | `2.0.0-rc` | Solid repo `packages/solid` (`test-integration` is on `2.0.0-rc.0`) |
| `@solidjs/web` | `2.0.0-rc` | Solid 2.0 runtime package (workspace in examples) |
| `@solidjs/router` | `2.0.0-next.13` | Used by `hackernews`, `hackernews-spa`, `notes` examples |
| `@tanstack/solid-query` | `^6.0.0-rc.0` | Branch `solid-query-v6-pre` — **or drop entirely** |
| `@solidjs/vite-plugin` | `3.0.0-next.28` | `references/solid-vite-plugin` (branch `next`); replaces `vite-plugin-solid`, on `babel-preset-solid` ^2.0.0-rc.0 |
| `@solidjs/testing-library` | latest | No compatibility issue |

### Solid 1.x APIs currently in use
- `createSignal` — all routes, `api/auth.ts`
- `createStore` (from `solid-js/store`) — `stores/index.ts`
- `render` (from `solid-js/web`) — `index.tsx`
- `createResource` — `App.tsx` (auth readiness)
- `createEffect` — `App.tsx` (auth redirect), `Queue.tsx` (WS subscription)
- `createQuery` / `createMutation` / `useQueryClient` — `@tanstack/solid-query` everywhere
- `<For>`, `<Show>`, `<Switch>`, `<Match>` — all routes
- `classList` — `Settings.tsx` (`StatusDot`)
- `/* @refresh reload */` directive — `index.tsx` (vite-plugin-solid HMR)

### Not used (so NOT affected)
- No `<Index>` — good (would be `<For keyed={false}>`)
- No `<Suspense>` / `<ErrorBoundary>` — only `<Loading>` / `<Errored>` renames would apply
- No `use:` directives, `attr:`/`bool:`/`on:` namespaces
- No `mergeProps` / `splitProps`
- No `batch()`
- No `onMount` / `onCleanup` (Queue uses `createEffect`'s return-cleanup)
- No `createContext` / `useContext` directly
- No SSR/hydration (pure SPA) — server-functions, streaming, hydration changes don't apply

---

## 3. Blockers & Risks

### 3.1 RESOLVED — Ecosystem compatibility
Previously the top risk; now resolved:

- **`@tanstack/solid-query`** → `^6.0.0-rc.0` on branch `solid-query-v6-pre` targets Solid 2.0. **However, it may be unnecessary** — see §3.1a.
- **`@solidjs/router`** → `2.0.0-next.13` (verified against the Solid 2.0 example apps).
- **JSX toolchain** → `vite-plugin-solid` is now **`@solidjs/vite-plugin`** (moved at commit `55570dc9`), version `3.0.0-next.28`, built on `babel-preset-solid` `^2.0.0-rc.0` — composes with Vite+ / Rolldown without issue. The `vite-plus`/Rolldown tooling needs no special handling.
- **`@solidjs/testing-library`** → fine; current tests are type-only anyway.

### 3.1a DECISION — Keep TanStack Query or drop it?
Solid 2.0's async primitives (`createMemo(async)`, `createStore(fn)`, `<Loading>`, `createProjection`) are capable of replacing TanStack Query for this app. The `hackernews-spa` example in the reference repo does exactly this — data fetching via `createMemo(() => getStories(...))` + `<Loading>`, no query library.

| Option | Pros | Cons |
|--------|------|------|
| **A: Keep `@tanstack/solid-query` 6.0.0-rc.0** | Minimal route-file churn; familiar `createQuery`/`createMutation` API; query cache/refetch semantics stay | Adds a dependency on an rc-quality package; carries 1.x-oriented patterns; `invalidateQueries`/`isPending` need re-verification under 2.0 batching |
| **B: Drop it, use Solid 2.0 async primitives** | No third-party data-layer dep; idiomatic 2.0; smaller bundle; matches reference examples | Touches all 8 route files; manual cache/refetch wiring (or `createProjection`); more upfront work |

**Recommendation:** Option B (drop it) aligns with 2.0 idioms and removes the largest ecosystem dependency — but Option A is the lower-risk, faster path if the goal is a quick port. The route files use a very uniform `createQuery` pattern, so either is mechanical.

### 3.2 MEDIUM — Batching semantics change
In 2.0, **setters don't immediately update reads**; values flush on microtask. Flows in `api/auth.ts` (login → `setUser` → redirect check in `App.tsx`) rely on reads seeing writes. These should be verified against the new batching model. Likely fine (they're separate microtask turns via `await`), but needs a behavioral pass.

### 3.3 MEDIUM — New dev diagnostics
2.0 introduces dev-time warnings/errors: **"top-level reactive read"** (e.g., reading `author.data!.x` at component-body top level or destructuring props) and **"write inside reactive scope"**. The codebase's heavy use of `data!` non-null assertions inside `<Show>` blocks will surface warnings. 2.0's `<Show>`/`<Match>` **callback form** provides type narrowing and is the recommended fix — this dovetails with the audit's earlier non-null-assertion cleanup.

---

## 4. Migration Plan

### Phase 0 — Toolchain swap (ready now)
1. Replace `vite-plugin-solid` with **`@solidjs/vite-plugin`** in `vite.config.ts` (oxc-based JSX transform; no Rolldown concerns).
2. Add `@solidjs/web` dependency; pin `solid-js` to `2.0.0-rc`.
3. Set `@solidjs/router` to `2.0.0-next.13`.
4. If keeping TanStack Query: set `@tanstack/solid-query` to `^6.0.0-rc.0`.
5. Verify `vp check` / `vp test` / `vp build` all green after the version bump alone (before touching source).

### Phase 1 — Imports & TS config (small, safe)
| File | Change |
|------|--------|
| `tsconfig.json` | `jsxImportSource: "solid-js"` → `"@solidjs/web"` |
| `src/index.tsx` | `import { render } from "solid-js/web"` → `"@solidjs/web"`; review `/* @refresh reload */` per `@solidjs/vite-plugin` 2.0 docs |
| `src/stores/index.ts` | `import { createStore } from "solid-js/store"` → `from "solid-js"` (store APIs moved to root) |
| `package.json` | add `@solidjs/web`; verify `solid-js` + deps resolution |

### Phase 2 — Data layer (choose Option A or B from §3.1a)
- **Option A (keep TanStack Query):** bump to `^6.0.0-rc.0`; verify `createQuery`/`createMutation` options, `useQueryClient`, and `invalidateQueries` still behave under 2.0 batching. Minimal source changes.
- **Option B (drop it, Solid async primitives):** replace each route's `createQuery` with async `createMemo`/`createStore(fn)` + `<Loading>`; replace `createMutation` with `action(...)` + optimistic helpers; route reads through `<Loading>` boundaries. Pattern reference: `examples/hackernews-spa` in the reference repo. Touches all 8 route files.

### Phase 3 — Reactive primitives
| Location | 1.x | 2.0 |
|----------|-----|-----|
| `App.tsx:21` | `createResource(async () => { await checkAuthEnabled(); return true })` | async `createMemo`/`onSettled` + `<Loading>`; the auth-gate effect must await readiness differently |
| `App.tsx:26` | `createEffect(() => { ...auth redirect... })` | split: `createEffect(() => authReady(), val => {...})` or compute/apply form |
| `Queue.tsx:28` | `createEffect(() => { const unsub = subscribeAll(...); return unsub; })` | split effect — compute phase declares deps, apply returns cleanup; or `onSettled` + returned cleanup |
| `api/auth.ts` | module-level `setUser`/`setAuthEnabled` | verify reads-after-writes under microtask batching |

### Phase 4 — Control flow & DOM
| Location | 1.x | 2.0 |
|----------|-----|-----|
| `Settings.tsx:27` (`StatusDot`) | `classList={{ "animate-pulse": ... }}` | `class={["base", { "animate-pulse": ... }]}` |
| `<For each={...}>` all files | default (keyed) | confirm callback shape `(item, i)` still matches; **only change if an item is used as an accessor** — currently items are used as raw values, so default behavior matches |
| `<Show when={data}>` + `data!` | non-null assertion | prefer `<Show when={...}>{narrowed => ...}</Show>` callback form for type narrowing; eliminates the 34 `data!` sites flagged in the earlier audit |

### Phase 5 — Dev-diagnostics cleanup
- Grep for top-level reactive reads (`rg "\.data!" src/`) and fix via `<Show>`/`<Match>` callback forms.
- Grep for writes inside reactive scopes (effects that `set*` while tracking) — convert to derived `createMemo` or event handlers.
- Run `vp check` and iterate on oxlint/type errors.

### Phase 6 — Behavior verification
- **Auth flow:** login → redirect, register, logout, auth-enabled toggle.
- **Queue live-updates:** WS subscription still invalidates the query.
- **Settings tabs:** `Switch`/`Match` still switch correctly under new batching.
- **Dashboard/Calendar/Wanted:** query data renders; loading/empty states correct.
- **Tests:** `vp test` (4 type tests) must pass unchanged.

---

## 5. File-by-File Impact

| File | Change type |
|------|-------------|
| `package.json` | deps: `solid-js` → 2.0.0-rc, add `@solidjs/web`, `@solidjs/router` → 2.0.0-next.13, `vite-plugin-solid` → `@solidjs/vite-plugin`; (Option A) `@tanstack/solid-query` → ^6.0.0-rc.0, or (Option B) remove it |
| `tsconfig.json` | `jsxImportSource` → `@solidjs/web` |
| `vite.config.ts` | swap `vite-plugin-solid` → `@solidjs/vite-plugin` |
| `src/index.tsx` | import path + HMR directive review |
| `src/App.tsx` | `createResource` → async memo + `Loading`; `createEffect` → split form |
| `src/stores/index.ts` | `solid-js/store` → `solid-js` import |
| `src/api/auth.ts` | verify batching-sensitive flows |
| `src/routes/Queue.tsx` | `createEffect` → split form (WS subscription cleanup) |
| `src/routes/Settings.tsx` | `classList` → `class`; non-null assertions → `<Show>` callbacks |
| All route files | (Option A) verify query API under 2.0; (Option B) `createQuery`/`createMutation` → async primitives + `action` |
| `src/__tests__/types.test.ts` | no changes expected (pure type tests) |
| `api/ws.ts`, `api/client.ts` | no changes expected (framework-agnostic) |

---

## 6. Suggested Sequencing

1. **Now (not blocked):** swap `vite-plugin-solid` → `@solidjs/vite-plugin`, bump `solid-js` → `2.0.0-rc`, add `@solidjs/web`, bump `@solidjs/router` → `2.0.0-next.13`, and — if keeping it — `@tanstack/solid-query` → `^6.0.0-rc.0`. Update `tsconfig.json` and the two import paths. Run `vp check` to validate the toolchain in isolation.
2. **Decide Option A vs B** for the data layer (§3.1a). If Option B, do a small spike on one route (e.g. `Dashboard`) converting `createQuery` → async `createMemo` + `<Loading>` before touching all routes.
3. **Then:** Phases 3–6 above.

---

## 7. Reference

- `references/solidjs-2.0/documentation/solid-2.0/MIGRATION.md` — primary migration guide
- `references/solidjs-2.0/documentation/solid-2.0/README.md` — RFC index (12 RFCs)
- `references/solidjs-2.0/examples/hackernews-spa` — **data fetching without a query library** (`createMemo(async)` + `<Loading>`), the pattern reference for Option B
- `references/solidjs-2.0/examples/{hackernews,notes}` — confirm `@solidjs/router` `2.0.0-next.13`
- Relevant RFCs:
  - [01] Reactivity, batching, effects — `createEffect` split, `flush`, top-level reads
  - [02] Signals, derived, ownership, context
  - [03] Control flow — `For`/`Repeat`/`Reveal`, `Loading`, callback forms
  - [05] Async data — `createResource` → async computations, `isPending`, `latest`
  - [06] Actions and optimistic — `action(...)`, `createOptimistic`
  - [07] DOM — `classList` → `class`, attributes
  - [08] Dev diagnostics — warnings/errors to expect
  - [09] TypeScript/JSX ownership — `@solidjs/web` `jsxImportSource`

### External references (verified locally)
- `references/solid-vite-plugin` — cloned from `github.com/solidjs/solid-vite-plugin` (branch `next`), version **`3.0.0-next.28`**:
  - Package renamed `vite-plugin-solid` → **`@solidjs/vite-plugin`** (as of `3.0.0-next.27`; commit `55570dc9`); old name re-exports it.
  - Peer/dep on `babel-preset-solid` `^2.0.0-rc.0` → targets Solid `2.0.0-rc.0`.
  - **Note (corrected):** the *default* JSX transform is still **babel-based** (`babel-preset-solid`); an optional `native` compiler exists (`compiler: 'native'`). The **oxc** reference appears only in `src/server-functions/compile.ts` — irrelevant to this SPA. So no oxc-specific assumption should be made for the client build; babel-preset-solid is the active path.
- `@tanstack/solid-query` `^6.0.0-rc.0` — branch `solid-query-v6-pre` (Solid 2.0 target)
