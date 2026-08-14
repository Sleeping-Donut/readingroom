# SolidJS 2.0 (RC) — Master Reference

**Compiled:** 2026-08-14
**Sources:** [RC announcement blog post](https://www.solidjs.com/blog/solid-2-0-rc-the-big-reveal) (via `solidjs/solid-site` @ `deploy-prod`), the official RC docs at https://v2.solidjs.com/, and the local 2.0 RFCs in `references/solidjs-2.0/documentation/solid-2.0/`.

> **This is the master reference.** The deep-dive sections live in two companion files:
> - Core concepts & JSX/async/boundaries/SSR → [`docs/solid-v2-core.md`](solid-v2-core.md)
> - Routing, ecosystem, migrations & testing → [`docs/solid-v2-ecosystem.md`](solid-v2-ecosystem.md)

---

## 1. The RC announcement — "The Big Reveal"

### 1.1 Async lives in the graph
The core thesis: **async is a property of the reactive system itself.** A computation can return a Promise (or async iterator) and everything downstream understands it — no `createResource`, no manual loading state, no null checks.

```tsx
import { createMemo, isPending, Loading } from "solid-js";

function Profile(props) {
  const user = createMemo(() => fetchUser(props.id));
  return (
    <Loading fallback={<Skeleton />}>
      <h1 class={{ stale: isPending(user) }}>{user().name}</h1>
    </Loading>
  );
}
```
When `props.id` changes, old content stays visible while the new answer is in flight; `isPending` reports "a new answer to *this* question is on the way". Derived state, errors, transitions, and optimistic updates all fall out of this one idea. The same components work whether data comes from a client fetch, a server render, or a server function.

### 1.2 Removals (workarounds you no longer need to learn)
- **`createResource` — gone.** Async flows through ordinary memos.
- **`batch` — gone.** Everything batches; writes apply on a microtask; `flush()` when you need them now.
- **`startTransition` / `useTransition` — gone.** The graph holds consistent state; `isPending`/`latest` read it.
- **`on` and `createComputed` — gone.** Split effects `createEffect(compute, apply)` separate tracking from side effects.
- **`produce` and `createMutable` — gone.** Store setters hand you a mutable draft.

### 1.3 One plugin, whole platform (Oxc compiler + start mode)
- New **Rust compiler toolchain on Oxc**; `@solidjs/vite-plugin` **defaults to it** (Babel preset remains available). Benchmarks: ~23–355× faster than babel-jsx-dom-expressions.
- The plugin ships a **start mode** — a turnkey serving layer in the plugin itself:
  ```ts
  // vite.config.ts
  import { defineConfig } from "vite";
  import solid from "@solidjs/vite-plugin";
  export default defineConfig({ plugins: [solid({ start: true })] });
  ```
- **SPA by default** (`start: true` alone): dev serves client-rendered onto a streamed shell; `vite build` emits static `dist/client`.
- **File-system routing** via router-neutral `filesystem-routing`; `GET`/`POST` API routes as fetch middleware; typed route emission for Solid Router.
- **SSR** with `solid({ start: true, ssr: true })` — swaps `render`→`hydrate`, one production contract: `handleRequest(request)`.
- **Server functions** — `"use server"` is now *core*, backed by `@solidjs/web/server-functions`; the directive boundary is itself the privacy mechanism (server-only refs never reach the client).

### 1.4 SolidStart is retired — start mode replaces it
SolidStart's jobs moved into core/server functions/start mode. "Instead of shipping a hollow 3.0, we're retiring it." SolidStart continues maintenance; the move is mechanical for most apps (migration guide available).

### 1.5 Ecosystem status at RC
- **Solid Router 2.0** ships with fully typed routes/params/navigation.
- **Solid Meta 1.0** is now a thin layer over 2.0's built-in head registry (`useHead` lives in `@solidjs/web`).
- **TanStack**: `fullstack-tanstack` template pairs TanStack Router + Query with start mode; `@tanstack/solid-start@beta` exists.
- Libraries ready: **Solid Primitives**, **Kobalte**, **Solid Testing Library**, **Storybook**, **AG Grid**.
- **Migration assistant**: `npx solid-migration-assistant` scans a project and prints per-site guidance.

---

## 2. Core model (summary)

> Full detail in [`docs/solid-v2-core.md`](solid-v2-core.md).

### 2.1 Packages
| Package | Role |
|---|---|
| `solid-js` | Core reactivity, components/JSX, stores, async model (stores now live here) |
| `@solidjs/signals` | Reactive core |
| `@solidjs/web` | DOM renderer, JSX type owner, head registry, SSR renders, server-function runtime |
| `@solidjs/vite-plugin` (v3) | Build plugin (Oxc default), start mode, generated entries |
| `@solidjs/router` (v2 `@next`) | Router factory, `query`/`action`/`revalidate` |
| `@solidjs/meta` (1.0) | Thin layer over the built-in head registry |

### 2.2 Reactivity
- Writes batch by default (microtask); reads return last committed value until `flush()`.
- `createEffect(compute, apply)` — compute tracks, apply is untracked and may return cleanup.
- `onSettled` replaces `onMount`; `createTrackedEffect` only for a single tracked callback.
- Dev: no writes in owned scopes (component bodies/memo/compute); top-level reactive reads warn.
- Function-form `createSignal(fn)` = writable derived signal.

### 2.3 Stores
- Draft-first setters (`setState(draft => { draft.x = y })`).
- `createStore(fn, seed)` / `createProjection` — derived/projected stores, reconciled by `id`.
- `createOptimisticStore` — tentative overlay that reverts on action settle.
- `snapshot` (was `unwrap`), `merge` (was `mergeProps`), `omit` (was `splitProps`), `reconcile`.

### 2.4 Components & JSX
- `jsxImportSource: "@solidjs/web"`; DOM JSX types from `@solidjs/web`, neutral `Component`/`Element` from `solid-js`.
- Control flow: `For` (keyed default / `keyed={false}`), `Repeat` (positional), `Show`, `Switch/Match`, `Loading`, `Errored`, `Reveal`.
- `class` object/array form replaces `classList`; `ref` directive factories replace `use:`.
- Context object is also its provider: `<Context value={...}>`.
- `dynamic()` from `@solidjs/web` for reactive component selection.

### 2.5 Async
- `createMemo(async)` reads as values; `<Loading>` owns first-readiness; `isPending(fn)` in-flight change; `Errored` handles rejections.
- `action(generator)` for mutations; `createOptimistic`/`createOptimisticStore` for expected results.
- `refresh`, `affects`, `latest`, `resolve`, `onSettled`.
- **Tracking is synchronous** — read every reactive input before the first `await`.

### 2.6 Boundaries & SSR
- `Loading` (not-ready), `Errored` (errors), `Reveal` (coordinated reveal order). Loading/Errored are separate states.
- `render`/`hydrate`/`renderToString`/`renderToStream` from `@solidjs/web`; `HydrationScript`, `NoHydration`/`Hydration`, `isServer`, `clientOnly`.
- Head registry: `useHead` from `@solidjs/web`; `@solidjs/meta` is the component layer.

---

## 3. Ecosystem (summary)

> Full detail in [`docs/solid-v2-ecosystem.md`](solid-v2-ecosystem.md).

### 3.1 Solid Router 2 (factory/config-based)
- `createRouter({ routes, ... })` returns the provider + static instance; **no JSX `<Route>`/`<A>`/`<Navigate>`/`HashRouter` components**.
- `defineRoute`/`defineRoutes`; plain `<a href>` (router-delegated); `Router.paths` typed URLs; `useNavigate`/`useLocation`/`useParams`/`useMatch`/`useBeforeLeave`.
- Data: route `preload`, `query(...)` keyed cache + `revalidate`, `action(...)` URL-addressable mutations (POST), `useSubmissions`, `.with()`, `.onSubmit`/`.onSettled`, `redirect`/`reload`/`respond` from `@solidjs/web`, single-flight (default on).
- Typed search schemas (Standard Schema), `matchFilters`, lazy subtrees, FS routing via `@solidjs/router/fs`.

### 3.2 Solid Meta 1.0 (head/metadata)
- **No `<MetaProvider>`**; registry is ambient via `@solidjs/web`.
- `<Title>`, `<Link>`, `<Meta>`, `<Script>`, `<Head>`; later-wins by identity; disposal restores; reactive.
- `useHead({ tag, props, key? })` from `@solidjs/web` for imperative/low-level head tags.
- Server renders splice winning tags into `<head>` automatically.

### 3.3 Vite plugin start mode
- `start: true` (SPA) or `{ start: true, ssr: true }` (streaming SSR + hydrate).
- Generated entries: `src/App.tsx` + `src/Document.tsx`; `handleRequest` deployment contract; `start.setup`, `start.middleware`, typed env (`virtual:env/server|client`).
- `serverFunctions` — `"use server"` in core, endpoint `/_server`.

### 3.4 TanStack
- Fullstack template: TanStack Router (matching/nav) + TanStack Query (cache) + Solid plugin (entries/SSR/server functions) + `@solidjs/web` server-function runtime (single-flight). `start.setup` builds a request-local router+QueryClient; single-flight via dehydrated query cache.

---

## 4. Migration cheatsheet (audit-ready)

- `solid-js/web` → `@solidjs/web`; `solid-js/store` → `solid-js`; `jsxImportSource` → `@solidjs/web`.
- `createResource` → `createMemo(async)` + `Loading`.
- `Suspense` → `Loading`; `ErrorBoundary` → `Errored`; `SuspenseList` → `Reveal`.
- `Index` → `<For keyed={false}>`; `classList` → object/array `class`; `use:` → `ref` directive factories.
- `onMount` → `onSettled`; `batch` → default batching; `on`/`createComputed` → split effects / derived signals.
- `produce`/`createMutable` → draft-first store setters.
- `createEffect` is two-arg; cleanup from apply; `initialValue` arg removed.
- Router: `createRouter` factory; `query`/`revalidate`/`action`; `redirect`/`reload`/`respond` from `@solidjs/web`; plain `<a>` links.
- Store helpers: `unwrap` → `snapshot`, `mergeProps` → `merge`, `splitProps` → `omit`.
- `flush()` after setters in tests; `resolve(() => value())` to await a reactive expression.

---

## 5. Audit focus areas for the frontend

When auditing `frontend/src/`, check for:
1. **Pending flags** — should be `createOptimistic` (process affordances), not plain signals; mutation handlers as `action`.
2. **`isPending`/`affects`** — any place a reload should read as pending but uses manual flags.
3. **`Errored` boundaries** — top-level and per-section; **`Loading` `on` prop** for re-showing fallback.
4. **`Reveal`** — coordinated reveal order across independent loading sections.
5. **Router v2 idioms** — `Router.paths` typed navigation, `query`/`revalidate` cache, route `action`s, `useBeforeLeave`, `[data-active]`/`[aria-current]` link styling.
6. **Head/metadata** — per-page `<Title>`/`<Meta>` via `@solidjs/meta` or `useHead`.
7. **Store idioms** — draft-first setters, `createStore(fn)` projections, `createProjection`, `reconcile`.
8. **Avoid-unnecessary-effects** — any `createEffect` that derives values or could be a memo/derived function.
9. **`Repeat`** — positional store lists that don't need diffing.
10. **`dynamic()`** — reactive component selection (e.g. dynamic tab content).
11. **Class object form** — string-ternary classes → object/array.
