# SolidJS 2.0 (RC) — Routing, Ecosystem & Migrations Reference

**Source:** https://v2.solidjs.com/ (fetched 2026-08-14). Compiled for auditing existing ReadingRoom frontend code against the Solid 2.0 release-candidate docs.

All 16 target pages loaded successfully. Key terms: `createRouter`, `defineRoute`, `defineRoutes`, `Router.paths`, `useRouter`/`useLocation`/`useNavigate`/`useParams`, `query`/`action`/`revalidate`, single-flight, `@solidjs/web` head handling, `@solidjs/meta` 1.0.

---

## 1. The coordinated ecosystem

Solid 2.0 splits the previous monolithic `solid-js`/`solid-start` world into independently versioned packages that must be upgraded **as one set**:

| Package | Role | Notes |
|---|---|---|
| `solid-js` | Core reactivity, components/JSX, stores, async model | `@solidjs/web` requires it as a **peer** |
| `@solidjs/web` | DOM renderer, JSX type owner, head registry, server render functions, server-function runtime, `redirect`/`reload`/`respond` | **New package**; replaces `solid-js/web`, `solid-js/html`, `solid-js/h`, `solid-js/universal` (those moved to `@solidjs/html`, `@solidjs/h`, `@solidjs/universal`) |
| `@solidjs/vite-plugin` (v3) | Build plugin; replaces `vite-plugin-solid`; owns `start` mode, generated entries, server functions, env, middleware | `start` mode is *not* SolidStart |
| `@solidjs/router` (v2, `@next`) | Routing factory, primitives, history adapters, `query`/`action`/`revalidate` | Entries: `@solidjs/router`, `/fs`, `/server` |
| `@solidjs/meta` (1.0) | Thin layer over Solid 2.0's **built-in head registry** (`useHead` lives in `@solidjs/web`) | Requires Solid 2; cannot upgrade Solid 1 alone |
| `@tanstack/router` + `@tanstack/query` | Optional full-stack alternative (Router + Query template) | Plugin: `@tanstack/router-plugin` |

### Package entry map (Solid Router)
- `@solidjs/router` — router factory, route & navigation primitives, history adapters, `query`/`action`.
- `@solidjs/router/fs` — converts a `virtual:file-routes` manifest (`pageRoutes`) into route definitions.
- `@solidjs/router/server` — `createFlightDataCollector` for the single-flight server-function collector.

### Vite plugin start mode vs SolidStart
- `start: true` / `start: {}` on `@solidjs/vite-plugin` is a **serving mode of the Vite plugin**. It is not SolidStart and provides none of the SolidStart runtime.
- `start` option owns entries, dev serving, preview serving, production build. `ssr` boolean selects streaming SSR. `serverFunctions` and `start.middleware` configure server behavior.
- Generated server entries render `<Document><App /></Document>` and hydrate the same tree client-side.

---

## 2. Routing overview (router-agnostic)

- Routing is an **application integration**, not a requirement of Solid. The router owns URL matching, navigation, and route rendering.
- **Mount the router in `App`**: in start mode, generated server + client entries both render `src/App.tsx` inside `src/Document.tsx`. Site-wide providers wrap the router; shared layouts live in the router's root route or inside its provider.
- **Route definition is platform-agnostic**: in-memory route tree, generated tree, or a manifest from a file-system routing plugin (`filesystem-routing` Vite plugin exposes `virtual:file-routes`; Solid Router adapts it via `fileRoutes` from `@solidjs/router/fs`). TanStack Router uses `@tanstack/router-plugin` over `src/routes`.
- **Connecting routing to requests (SSR)**: start mode creates a `RequestEvent` per web `Request`; Solid Router reads the URL from that event. Routers needing async prep use the `start.setup` server-only module — it runs once per SSR render before `renderToStream`, can create request-local router/cache instances, load routes, and return a component to render in place of `App`. `start.middleware` installs fetch-style middleware in front of page renders/server functions; both share `event.locals`.
- **Single-flight mutations** (router-neutral extension points):
  - Client: `subscribeFlightData` adds a single-flight header to non-GET server-function calls.
  - Server: `collectFlightData` hook receives target URL, revalidation keys, and request headers (with mutation cookies folded in). Awaited before the mutation call resolves.
  - Solid Router ships `createFlightDataCollector` from `@solidjs/router/server`; client enables single-flight by default and installs its consumer when the first router action is created (rendezvous so either side can load first). TanStack integration uses a dehydrated Query cache as the payload.

---

## 3. Solid Router (v2) — full reference

### 3.1 Setup

Install: `pnpm add @solidjs/router@next`.

```ts
// src/router.ts
import { lazy } from "solid-js";
import { createRouter } from "@solidjs/router";

export const Router = createRouter({
  routes: [
    { path: "/", component: lazy(() => import("./pages/Home")) },
    { path: "/about", component: lazy(() => import("./pages/About")) },
    { path: "*404", component: lazy(() => import("./pages/NotFound")) },
  ],
});
export const { paths } = Router;
```

- `createRouter` returns **both** the provider component and the app-wide static routing instance. Instance members `routes`, `config`, `paths`, `match()` are static; session-specific state comes from primitives inside the provider.
- Mount as the app root; the **render-prop child is the root layout** — stays mounted while matched routes render through `props.children`. A factory-level `preload` result becomes the root layout's `props.data`.

```tsx
// src/App.tsx
export default function App() {
  return (
    <Router>
      {(props) => (
        <>
          <header>
            <a href={Router.paths()}>Home</a>
            <a href={Router.paths.about}>About</a>
          </header>
          <main>{props.children}</main>
        </>
      )}
    </Router>
  );
}
```

`createRouter` options:
- `routes` — immutable route tree (matching + type inference).
- `base` — prefix for matching/generated paths.
- `preload` — root-layout data once per mount or server request.
- `history` — history adapter (`hashHistory()`, `memoryHistory(initialUrl)`). Default: browser history on client, current request URL on server.
- `preloadLinks` — route code/data preloading from link hover/focus/touch.
- `explicitLinks` — only anchors with a `link` attribute are router-delegated.
- `singleFlight` — server-function data consumer; **defaults to `true`**.
- `actionBase` — server-action URL prefix; defaults to `/_server` (keep aligned with a customized `serverFunctions` endpoint).
- `scrollRestoration` — explicit back/forward scroll restoration.
- `transformUrl` — rewrite pathnames before matching.

Gotchas:
- **No nested routers.** Compose one route tree from extracted arrays or lazy route subtrees.
- Mount without start mode via `render(() => <App />, el)` from `@solidjs/web`.

### 3.2 Route definitions

```ts
import { defineRoutes, defineRoute } from "@solidjs/router";
export const routes = defineRoutes([
  { path: "/", component: Home },
  { path: "/about", component: About },
  { path: "*404", component: NotFound },
]);
```

- `defineRoutes` preserves path literals in an extracted array (plain `const routes: RouteDefinition[] = [...]` widens to `string` — **old 0.x workaround to remove**). Inline arrays already get literal inference.
- `defineRoute` is an identity helper typing a component + preload from the path pattern:

```ts
const storyRoute = defineRoute({
  path: "/stories/:id/:tab?",
  preload: ({ params }) => getStory(params.id),
  component: (props) => (
    <Story story={props.data} id={props.params.id} tab={props.params.tab} />
  ),
});
```

- `:id` → `string`; `:tab?` → `string | undefined`. Preload return type becomes `props.data`. Parent-inherited params are `string | undefined`.
- External component typing via path witness: `const Story: RouteComponent<typeof Router.paths.stories> = ...` and `RouteProps<typeof Router.paths.stories>`.
- **Path tokens:** `:name` required; `:name?` optional; `*name` wildcard (must be final segment). Array of paths keeps one route mounted across them: `{ path: ["/login", "/register"] }`.
- **`matchFilters`**: `{ id: int }` with built-in `int` — rejects non-integer at runtime AND changes `Router.paths` arg to `number`. Route components still receive URL params as strings.
- **`info`**: arbitrary metadata; read via `useRouteMatches()` or `Router.match(url)`. Augment `declare module "@solidjs/router" { interface RouteInfo { breadcrumb?: string } }`.
- **Lazy subtrees**: `children: () => import("./admin/routes")` — module exports `default` or `routes`. Thunk runs when matching/preloading reaches it; cached + compiled into the tree. Must be deterministic.
- **File-system manifest**:

```ts
// vite.config.ts
plugins: [solid({ start: true }), fileRoutesPlugin()],
// router.ts
import { pageRoutes } from "virtual:file-routes";
import { fileRoutes } from "@solidjs/router/fs";
export const Router = createRouter({ routes: fileRoutes(pageRoutes) });
```

Each module default-exports its component; a named `route` export supplies `preload`, `matchFilters`, `search`, `info`, wrapped with `defineFileRoute("/blog/:id", {...})` (the string is a type witness; the manifest path is runtime truth). Manifest components become Solid `lazy` components; with `codeSplitting: false` they pass through eagerly.

### 3.3 Nested routes and layouts

```ts
function AccountLayout(props) {
  return (
    <section>
      <h1>Account</h1>
      <nav>
        <a href="/account">Profile</a>
        <a href="/account/security">Security</a>
      </nav>
      {props.children}
    </section>
  );
}
export const routes = defineRoutes([
  {
    path: "/account",
    component: AccountLayout,
    children: [
      { path: "/", component: Profile },
      { path: "/security", component: Security },
    ],
  },
]);
```

- Matched route components receive `params`, `location`, `data`, `children`.
- **Pathless layouts**: a route without `path` adds a component/preload to the chain without a URL segment (open `Params` type).
- **Parent params merge**: at `/teams/solid/members/42` the leaf sees both `teamId` and `memberId`; `useParams()` returns merged params. Narrow with a witness: `useParams(Router.paths.teams("solid").members)`. Params are strings at runtime even under `int` filters.
- **Layout reuse**: a matched route context is reused while its definition stays in the next match chain → sibling children keep shared parent layouts mounted. Root render prop is *outside* the chain and stays mounted across all routes (app-wide layout/providers); section layouts go in nested route components.
- **Nested data**: each matched route can define `preload`; it runs when the route context is created; the return value becomes `props.data` for that component (e.g. `<TeamContext.Provider value={props.data}>`). Preloads also feed hover/focus preloading and single-flight.

### 3.4 Navigation and typed paths

- **Declarative links are plain `<a>` anchors**, intercepted via delegated events when same-origin inside the base. The router does **not** intercept: external URLs, non-HTTP schemes, downloads, `rel="external"`, or `target`-bearing anchors.

```tsx
<nav>
  <a href={Router.paths()}>Home</a>
  <a href={Router.paths.users(42)}>User</a>
</nav>
```

- **`Router.paths`** builds typed URLs:

```ts
Router.paths();                      // "/"
Router.paths.users(42).settings();   // "/users/42/settings"
Router.paths.search({ q: "solid", page: 2 }, "results"); // "/search?q=solid&page=2#results"
```

Property access = static segments, call = bind params, no-arg call = plain `string`. `matchFilters` narrows inputs; a `search` schema types the search object per path end.

- **`useNavigate`** for application-logic navigation: `navigate(Router.paths.account, { replace: true })`; `navigate(-1)` moves through history. Relative strings resolve against current location; leading `/` resolves under base.
- **`useLocation`** — reactive: `pathname`, `search`, `hash`, `query`, `state`, `key`.
- **`useParams`** — merged chain params; `useParams(Router.paths.users)` narrows keys.
- **Typed search**: raw `useSearchParams()` returns strings/string-arrays; `setSearchParams` merges and removes keys on `""`/`undefined`/`null`, navigates without scroll by default. A route `search` (synchronous Standard Schema validator) parses+types both reads and setters. Schema outputs merge over raw values; a schema with issues is skipped; **async schema validation throws (unsupported)**.
- **Active/pending link state** on claimed anchors: `aria-current="page"` (exact match), `data-active` (exact or descendant), `data-pending` (in-flight navigation target). Root path matches exactly only. `useLinkState(() => href, { end })` exposes reactive `active`/`current`/`pending` for custom link components.
- Anchor attributes: `replace`, `noscroll`, `state` (JSON for `location.state`), `preload` (`"false"` keeps code preloading but skips route-data preload), `link` (for `explicitLinks: true`).
- **Observation/guards**: `useIsRouting()` (true while nav work settles), `useMatch(() => "/docs/*rest")`, `useRouteMatches()` (resolved match chain), `useBeforeLeave`:

```ts
useBeforeLeave((event) => {
  if (!dirty()) return;
  event.preventDefault();
  if (window.confirm("Discard unsaved changes?")) event.retry(true);
});
```

`retry(true)` skips leave handlers on the retried navigation.

### 3.5 Data loading and mutations

**Route preloads** run before component creation with `{ params, location, intent }`. Intent: `"initial"`, `"navigate"`, `"native"` (history traversal), `"preload"` (warm-up). Factory `preload` gets merged full-chain params and feeds the root layout's `props.data`.

**Preloading from links** (default): hover, focus, touch warm lazy components + route data. `preloadLinks: false` disables; per-link `preload="false"`; explicit `usePreloadRoute()`: `preloadRoute(Router.paths.users(42), { preloadData: true })`.

**`query` — keyed caching:**

```ts
import { query } from "@solidjs/router";
export const getUser = query(async (id: string) => {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}, "users");
```

- Key = name + serialized args: `.key` → `"users"`, `.keyFor("42")` → `'users["42"]'`.
- Cache scope: request-scoped on server, app-scoped in browser. Browser reuse window ~5s (preload + render share work); tracked consumers keep entries live; native back/forward reuse retained entries; unused browser entries swept after ~3 min.
- Read via async-aware primitive: `createMemo(() => getUser(params.id))` then `user().name` (never `createAsync` — removed).
- `query` wrapping an **undeclared server function** declares it as a GET via the Solid server-function transport; plain functions stay plain.

**`revalidate`:**

```ts
revalidate(getUser.key);            // all arg combos (prefix match)
revalidate(getUser.keyFor("42"));   // one combo
revalidate();                       // every client cache entry
```

Forced revalidation marks entries stale + retriggers live consumers.

**`action` — URL-addressable mutations:**

```ts
import { action } from "@solidjs/router";
import { redirect } from "@solidjs/web";
const updateProfile = action(async (form: FormData) => {
  await saveProfile(form);
  return redirect("/account");
}, "update-profile");
```

- `<form action={updateProfile} method="post">` — the delegated pipeline marks the form `aria-busy="true"` until action + revalidation settle. **POST only.**
- **Server-rendered client actions need a stable explicit name** so server and client serialize the same URL; a server function already supplies its server-action URL.
- **`.with(...)`** binds typed args into the URL: `action(async (id, form) => ...).with(todo.id)`.
- **`.onSubmit(...)`** — owner-scoped callbacks before settle (optimistic writes). **`.onSettled(...)`** — receives a `Submission` after *every* completion, incl. void/redirect. Listeners registered under a reactive owner are removed on owner disposal.
- **`useSubmissions(action)`** — settled results/errors: `latest()?.result`, `.error`, `.clear()`, `.retry()`. Router retains only outcomes with result or error; void/metadata-only completions still reach `.onSettled`.
- **`useAction(action)`** — invoke from code: `await submit(settings())`. Requires client JS; no browser form fallback.
- **Revalidate after mutation**: response metadata from `@solidjs/web` (`respond(data, { revalidate: [...] })`, `redirect`, `reload`) invalidates matching query entries and does relative redirects through router navigation. With single-flight, the response can carry fresh query values for the destination route's preloads, seeded before the action call resolves.

### 3.6 Server rendering and hydration

- **Same router instance client + server.** No separate server router.
- Select server URL: a request event takes precedence; otherwise pass `url` prop: `<Router url="https://example.com/users/42" />`. Only pathname + search select the route. Client history adapters never select the server location.
- **Lazy subtrees need streaming**: use `await renderToStream(() => <Router url={request.url} />)`. `renderToString` does **not** support a matched lazy subtree.
- **Hydrating `query` results**: during async SSR, `query` serializes keyed results into the hydration registry (unless hydration disabled or request marked server-only). Client adopts when name + serialized args match. Adoption stays available after global hydration (late lazy reads), but only while the payload is younger than the **3-minute query retention limit**.
- **Single-flight collector:**

```ts
// src/server-config.ts
import { createFlightDataCollector } from "@solidjs/router/server";
import { configureServerFunctionsServer } from "@solidjs/web/server-functions/server";
import { Router } from "./router";

configureServerFunctionsServer({
  collectFlightData: createFlightDataCollector(Router),
});
```

  Collector flow: match the post-mutation URL → resolve lazy subtrees → run root preload → run matched route preloads in data-only mode → return keyed `query` values in the mutation response. Client subscribes when `singleFlight` (default true); seeds values into the query cache, then applies revalidation/redirect metadata before the action caller gets the return value.
- **Register the collector before dispatch** via `@solidjs/vite-plugin` `serverFunctions: { configure: "./src/server-config.ts" }` (generated handler imports it first). Custom handlers pass `collectFlightData` to `handleServerFunctionRequest` per request. Default endpoint `/_server` must align with router `actionBase`.
- **No-JavaScript forms**: server-function actions keep a POST form path — the runtime redirects with a one-shot flash cookie; the router decodes it into submission state on the redirected SSR render. Router also intercepts server-action form URLs on clients where the action module isn't loaded (loads the submit path on demand). Client-only actions have no no-JS path.

---

## 4. TanStack Router integration

`fullstack-tanstack` template: TanStack Router owns matching/navigation; TanStack Query owns the data cache; the Solid plugin owns entries, document stream, request event, and server-function wiring; `@solidjs/web` server-function runtime owns the single-flight envelope.

- **Route setup**: `@tanstack/router-plugin` scans `src/routes` → `src/routeTree.gen.ts`; registered **before** `@solidjs/vite-plugin`. A shared `createAppRouter(queryClient, history?)` factory passes the generated tree + `QueryClient` through router context; loaders `prefetchQuery` and components read via `useQuery`. Template sets `disableGlobalCatchBoundary: true` (removes TanStack's `Loading`/catch wrapper to match server/client trees). `src/routes` is reserved for TanStack; the `filesystem-routing` plugin scans `src/api` → `/api` via `virtual:file-routes`, dispatched by middleware.
- **SSR ownership**: the Solid plugin owns the HTML stream + `Document`; the template does **not** use TanStack's `RouterServer`/`RouterClient`/stream bootstrap. `start.setup` → `src/setup.tsx` creates a request-local `QueryClient` + router with memory history from pathname/search, awaits `router.load()`, waits for loader-started queries to settle, stores `dehydrate(queryClient)` on `event.locals`, returns a `QueryClientProvider`+`RouterProvider` tree in place of `App`. `src/Document.tsx` serializes state into `window.__QUERY_STATE__` (escaping `<`); `src/App.tsx` hydrates a module-scoped client `QueryClient` from it and awaits `router.load()` before rendering providers.
- **Query ownership**: reads are `queryOptions` around Solid server functions; loaders start `prefetchQuery` without returning the promise, so setup waits on pending cache promises before dehydrating. Shared factory sets `staleTime` 30,000 ms.
- **Single-flight**: server `serverFunctions.configure` → `collectFlightData` creates a fresh router + `QueryClient` for the target URL, loads routes, awaits queries, returns `dehydrate(...)` (or nothing). Client `subscribeFlightData` passes each payload to `hydrate(queryClient, data)`; transport awaits it before resolving the mutation. Mutations remain Solid server functions via TanStack Query `useMutation` (each wrapped in its own `mutationFn`); no `invalidateQueries` after mutation. Native POST forms still work (`action` = server function URL → 303 redirect to referrer).
- **Public seams**: `start.setup` (per-request provider tree), `event.locals` (SSR cache handoff), router context (QueryClient access), `dehydrate`/`hydrate` (SSR + single-flight), `serverFunctions.configure` + `subscribeFlightData`. `start.setup` only works with generated server entries; authored entries must do their own prep.

---

## 5. Migration guides

### 5.1 From Solid 1.x — the big one

**Compatibility boundary:** no `solid-js/web`/`solid-js/store` exports; `@solidjs/web` peer-requires Solid 2. Upgrade runtime, renderer, JSX compiler, and framework integrations **together**. Upgrade order: baseline → deps → imports/JSX types → setter timing/effects/lifecycle → stores → resources/transitions/mutations/async → rendering/SSR/hydration → test dev + prod. Passing types ≠ compatible (transforms, delegation, hydration IDs, async scheduling are runtime contracts).

**Package/JSX moves:**

```ts
// Solid 1
import { createStore, reconcile } from "solid-js/store";
import { hydrate, render } from "solid-js/web";
// Solid 2
import { createStore, reconcile } from "solid-js";   // stores moved INTO solid-js
import { hydrate, render } from "@solidjs/web";
```

`tsconfig`: `"jsx": "preserve"`, `"jsxImportSource": "@solidjs/web"`. DOM `JSX`/`ComponentProps` from `@solidjs/web`; neutral `Component`/`Element` from `solid-js`. `solid-js/h` → `@solidjs/h`, `solid-js/html` → `@solidjs/html`, `solid-js/universal` → `@solidjs/universal`, jsx runtimes → renderer-owned entries.

**Signals and staged writes:** writes outside a sync flush scope are staged; the queue commits on the next microtask. `setCount(1); count(); // 0` then `flush(); count(); // 1`. `flush(fn)` = sync flush scope + drain. **Remove `batch`** (writes already batch); replacing `batch` with `flush` changes deferred work to sync. Dev mode rejects writes in owned scopes (component bodies, memo computations) → derive with `createMemo`, write from handlers/actions/effect apply. Top-level reactive reads in component bodies warn → keep props/store reads inside JSX/expressions. **Function-form `createSignal(fn)` is new** — a writable derived signal (replaces "write-back derivation" patterns).

**Two-phase effects:**

```ts
createEffect(
  () => title(),                       // compute: tracks deps, no app writes
  (value) => { document.title = value; } // apply: untracked, imperative, may return cleanup
);
```

- Extract store properties in compute phase; read `deep(store)` when subscribing to every nested prop, `snapshot(store)` for a plain value.
- `initialValue` argument removed from `createEffect`/`createMemo`; compute receives `prev` (`undefined` first run). Second `createMemo` arg is now the options object.
- Replacements: `on(...)` → compute fn + `defer` option; `onMount` → `onSettled` (+ cleanup return); effect-local `onCleanup` → cleanup from apply; `catchError`/`onError` → `<Errored>` boundary or effect `error` callback; `createTrackedEffect` only for a single tracked callback (cannot nest primitives, like `onSettled`).

**Stores → draft setters:**

```ts
// Solid 1
setState("user", "address", "city", "Paris");
// Solid 2
setState((draft) => { draft.user.address.city = "Paris"; });
```

Delete `produce()` wrappers (pass the body). `createMutable`/`modifyMutable` → `createStore` + draft setters. `storePath("user","address","city","Paris")` is a migration helper (indexed/filtered/ranged supported). `reconcile(serverTodos, "id")(draft.todos)` now runs against the selected draft. Utilities: `unwrap` → `snapshot`; `mergeProps` → `merge` (`undefined` overrides); `splitProps` → `omit`; selector-shaped state → `createProjection` or function-form `createStore`.

**Resources → async computations:**

```ts
// Solid 1
const [user] = createResource(userId, fetchUser);
// Solid 2
const user = createMemo(() => fetchUser(userId()));
```

`<Loading fallback={<UserSkeleton />}>` owns branch readiness; revalidation keeps committed content visible after first render. Replacements: `resource.loading` → `Loading` + `isPending(() => resource())`; `resource.error` → `Errored`/effect `error`; `refetch()` → `refresh(resource)`; `mutate()` → action + `createOptimistic`/`createOptimisticStore`; `resource.latest` → `latest(resource)`. Bare `refresh()` doesn't set `isPending`; call `affects(target)` first when it must present as pending. `loadingValue`/`seedLoadingValue` only for provisional data with the final shape.

**Mutations / transitions:** remove `startTransition`/`useTransition`. `action` = async generator returning a promise; optimistic writes visible during the transaction, revert on settle. Yield promises to keep the transaction; after an `await`, add a bare `yield` before later writes; never `flush()` inside an action; invoke from handlers/imperative scope only.

**Boundaries/control flow/JSX:** `Suspense` → `Loading`; `ErrorBoundary` → `Errored` (fallback receives an error accessor, read with `error()`); `SuspenseList` → `Reveal`; `Index` → `<For keyed={false}>` (item accessor, stable index); `Context.Provider` → `<Context value={...}>`; `createDynamic` → `dynamic(source)`. JSX forms: `classList` → object/array `class`; `use:` → `ref` callback/directive factory (+ ref arrays); `on:`/`oncapture:` → camel-case props (or `addEventListener` for native options); `attr:`/`bool:` → standard attrs; remove `/*@once*/`. Delegated events are now per-root and disposed with the root; remove `clearDelegatedEvents`.

**Client rendering/SSR:** `render`/`hydrate`/`renderToString`/`renderToStream` from `@solidjs/web` (keep `render`'s dispose fn). `renderToString` = sync, renders Loading fallbacks; `renderToStream` = shell then async fragments; `renderToStringAsync` → `await renderToStream(...)`; exactly one stream consumer (`pipe`/`pipeTo`/`readable`, readable gives `Uint8Array` chunks for a web `Response`). `ssrSource` default `"server"` adopts serialized results; use `"hybrid"`/`"client"` only when verified.

**Removed-API table (by intent):** `createComputed` → memo/split-effect/function-signal; `batch` → default batching; `on` → compute phase; `onMount` → `onSettled`; `onError`/`catchError` → `Errored`/effect error; `createResource` → async computations; `createMutable`/`modifyMutable` → store + draft setters; `produce` → draft callback; `createSelector` → `createProjection`/function-store; `from`/`observable` → async iterables (or split effect; no direct core replacement); `createDeferred` → external scheduling; `indexArray` → `mapArray({ keyed: false })`; `resetErrorBoundaries` → remove; `enableScheduling`/`writeSignal` → remove.

**Testing under 1.x migration:** compile with the renderer's JSX runtime; resolve browser + dev conditions for web tests (not the server entry); `flush()` after setters before asserting; `await user.click(...)`; `resolve(() => value())` to wait on a reactive expression; test Loading/settled/pending/error states separately; run in dev mode to catch diagnostics.

### 5.2 From SolidStart — what Solid 2 replaces

**Critical:** *"This is not a SolidStart upgrade."* Released SolidStart 2 runs on Solid 1 and does not support Solid 2. Create a **separate** Solid 2 app using `@solidjs/vite-plugin` 3 **start mode**, then move code in. Start mode is not SolidStart and has no SolidStart runtime.

- Migrate platform deps first (core per From Solid 1; router per From Solid Router; head per From Solid Meta). Keep the old app runnable; move one route/server feature at a time.
- Copy: `public/`, assets, compatible components, domain code (no SolidStart/Vinxi/Nitro/H3 imports), route component bodies (adapt exports), server-function bodies (re-add auth/validation). Rewrite: `app.config.ts`/SolidStart vite config, entry-client/server, document shell + app root, router bootstrap + `FileRoutes`, `@solidjs/start/*`, `vinxi/*`, `nitropack/*`, H3 imports, middleware/sessions/adapters.
- **SolidStart 1** (Vinxi, Nitro, `app.config.ts`): record `ssr`, `appRoot`, route dir, middleware, prerender, `server` options, `~/` aliases, entries, imports; run behavioral baseline. Rules: `app.config.ts` is a checklist only; split `app.*` into `src/App.tsx` + `src/Document.tsx`; remove `StartClient`/`StartServer`/`mount`/`createHandler`; preserve route filenames only if the FS convention matches; rewrite `onRequest`/`onBeforeResponse` middleware as fetch-style; replace `vinxi/http` sessions with a session lib over the request event; replace Nitro presets/storage/tasks/WebSockets/prerender.
- **Released SolidStart 2** (`solidStart()`, Vite env builds, Nitro deployment plugin): record all options; remove `@solidjs/start`, `solidStart()`, the deployment plugin until `vite preview` works; rewrite H3 middleware + `@solidjs/start/http` against `Request`/`Response`/request event; redesign `serialization`, `devOverlay`, islands, prerender, Nitro config (start mode has no equivalents).
- **Targets:** `solid-v2/bare` (client-only), `solid-v2/basic` (Solid Router + FS pages), `solid-v2/fullstack` (SSR + server functions/sessions/middleware/API), `solid-v2/fullstack-tanstack`.
- **Package boundary:** keep template's Solid 2/`@solidjs/web`/Vite/`@solidjs/vite-plugin` versions; no `@solidjs/start`/Vinxi/Nitro/old router. Scripts: `dev`/`build`/`serve` = `vite`/`vite build`/`vite preview`.
- **Start mode config:** `solid({ start: { middleware: "./src/middleware.ts" }, ssr: true, serverFunctions: true, extensions: [".jsx", ".tsx"] })` plus `fileRoutes({ httpMethods: true })`. `start: true` ≡ `start: {}`; object form for `app`/`entryServer`/`entryClient`/`document`/`middleware`/`setup`/`env`/`external`. Map: source SSR → top-level `ssr`; route dir → `fileRoutes({ dir })`; middleware → `start.middleware`; `~` alias → `resolve.alias` (start mode adds none); host/build serving → deployment boundary (no Nitro options in `start`).
- **Generated entries:** delete old `src/entry-client.*`/`entry-server.*` (if present they're selected instead). Generated SSR entries render `<Document><App /></Document>`, hydrate the same tree, inject built client entry + styles. Authored entries only when needed: server entry exports `render(request?, context?)`; client entry hydrates the same tree. `App.tsx` must not contain `<html>/<head>/<body>`; `Document.tsx` renders `props.children` + `<HydrationScript />` from `@solidjs/web` (no `props.assets`/`props.scripts`/`#app` mount).
- **Router selection** (start mode selects none): Solid Router — `fileRoutes(pageRoutes)` via `@solidjs/router/fs`; FS conventions: `routes/index.tsx`→`/`, `routes/blog/index.tsx`→`/blog/`, `routes/users/[id].tsx`→`/users/:id`, `routes/docs/[...path].tsx`→`/docs/*path`; `routes/users.tsx` + `routes/users/` = layout + nested pages. TanStack — use the pinned template; `start.setup` creates a request-specific router; don't reuse SolidStart router server/client protocol.
- **Server functions:** `serverFunctions: true` before moving any `"use server"` fns; default endpoint `/_server`; function- and module-level directives supported. Keep DB/credential imports server-only; use web `Request`/`Response` + `getRequestEvent()` from `@solidjs/web`; validate args + authorize inside every callable; replace old `query`/`action` wrappers with the router's Solid 2 APIs.
- **Environment:** `VITE_` vars via `import.meta.env`; typed Standard Schema file at root `env.ts`/`env.js`; import `virtual:env/server` (server-only) and `virtual:env/client`; plugin generates `solid-env.d.ts`; no `@solidjs/start/env` reference.
- **Sessions/auth:** start mode supplies request event + cookies on headers + response metadata — no session helpers. Fullstack template composes `@remix-run/cookie` with `getRequestEvent()`, `event.request.headers`, `Set-Cookie` on `event.response.headers`, secret from `virtual:env/server`. Cookie is signed but **not encrypted**; use storage-backed sessions for revocation/secrets. Authorize inside every protected server function/API handler.
- **Middleware/API routes:** `start.middleware` default-exports `(request, next) => Response|Promise<Response>` or an array; code before `await next()` runs in order, after it unwinds; return `Response` without `next()` to stop; `getRequestEvent()` reads/writes `event.locals`. API dispatch: `fileRoutes({ httpMethods: true })` + `createAPIHandler(routes)` from `filesystem-routing/api` in the chain; modules export uppercase `GET`/etc; a method-only module = API route without a page. Handler semantics differ from SolidStart — retest `HEAD`, missing methods, `undefined` results, params, cookies, errors.
- **Deployment boundary:** `vite build` with start+ssr writes `dist/client` + `dist/server/server.js` exporting `handleRequest` (`Request` → `Promise<Response>`). Serve `dist/client` first, forward unmatched requests; preserve status/headers/`Set-Cookie`/streamed body. Don't deploy old Nitro output; don't hide host gaps behind `start.external: true` (only when a host owns both server build + HTTP serving).
- **Removed features to resolve:** `~` alias, `appRoot`/route-dir behavior, dev toolbar, framework prerendering, Nitro tasks/storage/WebSockets/presets, islands, SolidStart `serialization`, `@solidjs/start/http` helpers, framework API dispatch.
- **Verify each slice:** direct SSR, browser nav both directions, document head + status, server-function success/validation/auth/redirect, API methods/middleware order/cookies/session expiry, `vite build` + `vite preview`, production adapter with streaming + multiple `Set-Cookie`, client output free of server-only modules/secrets.

### 5.3 From Solid Router 0.x/1.x — the component → config migration

**Compatibility:** Router 2 needs matching Solid 2 RC `solid-js` + `@solidjs/web`; cannot layer over Solid 1. One router instance per app; don't nest a Router 2 instance in an old `<Router>`. **Removed with no component-for-component replacement:** `Router`/`HashRouter`/`MemoryRouter` components, `Route`, `A`, `Navigate`, `createMemoryHistory`. New entry points: factory, `defineRoutes`/`defineRoute`, plain anchors, history adapters.

**Create the instance:**

```tsx
// before
<Router root={RootLayout} rootPreload={loadSession}>
  <Route path="/" component={Home} />
  <Route path="/users/:id" component={User} />
</Router>
// after
export const Router = createRouter({
  routes: [
    { path: "/", component: Home },
    { path: "/users/:id", component: User },
  ],
  preload: loadSession,
});
<Router>{(props) => <RootLayout {...props} />}</Router>;
```

`rootPreload` → factory `preload`. Alternate components → adapters: `hashHistory()`, `memoryHistory("/initial")`. Wrap extracted arrays with `defineRoutes` (preserves literals).

**Nesting:** nested `<Route>` elements → `children` arrays; keep an index child `path: "/"` when the parent has deeper children; pathless route for a segment-less layout; don't recreate nested `<Routes>` with nested instances — use `children: () => import("./admin/routes")`.

**Links/redirects:** `<A>` → `<a>`; `activeClass`/`inactiveClass`/`end` → `[data-active]`/`[aria-current="page"]` CSS; `noScroll` → `noscroll`; `<Navigate>` → `useNavigate` at setup (return `null`) or a redirect from query/action; `useCurrentMatches` → `useRouteMatches`; `useLinkState` for custom links.

**Typing:** `defineRoute` for inline; path witness `RouteComponent<typeof Router.paths.users>` / `RouteProps<...>` for external; `useParams(Router.paths.users)` narrowing; synchronous Standard Schema `search` validator (`import * as v from "valibot"`) for typed search — input type drives URL construction, output drives parsed reads; async validation unsupported.

**Data:** keep `preload`; don't move every read into preload (preload = start work, component read = reactive consumer). **Remove** `createAsync`/`createAsyncStore` → read `query` via `createMemo`. `cache` alias → `query`; `revalidate` via `.key`/`.keyFor(...)`. **Pending submissions split:** `useSubmission(...).pending` → action `.onSubmit` + optimistic primitives (`createOptimistic`/`createOptimisticStore`), form `aria-busy`, `useSubmissions()` for settled, `.onSettled` for every completion. **Response helpers:** `redirect`/`reload`/`respond` now from `@solidjs/web`; old router `json(data, init)` → `respond(data, init)` (metadata carries `revalidate` keys + redirects).

**SSR/hydration:** same module-level instance both sides; drop the `isServer ? request.url : ""` pattern — request event or `url` prop; `await renderToStream(...)` when a lazy subtree may match. Query results hydrate via the hydration registry (name + serialized args must match; 3-min retention). Single-flight collector via `createFlightDataCollector(Router)` + `configureServerFunctionsServer`, pinned with `serverFunctions.configure`.

**FS routing:** `<FileRoutes />` → `fileRoutes(pageRoutes)`; route module `route` export via `defineFileRoute("/blog/:id", {...})`.

**TypeScript workarounds to remove:** `const routes: RouteDefinition[] = [...]` → `defineRoutes`/`defineRoute`/`as const`. Use `Router.paths`, `RouteProps`/`RouteComponent` witnesses, `defineFileRoute`, `search` schemas, `matchFilters`.

**Removal checklist:** upgrade `solid-js`+`@solidjs/web`+`@solidjs/router` together; one module-level router; JSX `<Route>` → objects; `root` → render prop, `rootPreload` → `preload`; nested → `children` arrays; router components → factory + adapter; `<A>` → `<a>`; `<Navigate>`; `useCurrentMatches` → `useRouteMatches`; `cache` → `query`; remove `createAsync`/`createAsyncStore`/`useSubmission`; pending UI → optimistic/`aria-busy`; `redirect`/`reload`/`respond` from `@solidjs/web`; stable query names/args and server-rendered client action names; same instance server+client; register collector before dispatch; `<FileRoutes />` → `fileRoutes(pageRoutes)`; widened route-array types → typed helpers.

### 5.4 From Solid Meta 0.x — head/metadata

Solid Meta 1.0 = thin layer over **Solid 2.0's built-in head registry**. Requires Solid 2.

- **Delete `<MetaProvider>`** — the registry is ambient; `MetaContext`/provider are gone.
- **Delete server plumbing** — the `tags={[]}` + `renderTags(tags)` splice is gone; `renderToString`/`renderToStream` splice winning tags into `<head>` automatically; tags under `Loading` boundaries stream as client patches. When assembling HTML manually, use the `onHead` render option.
- **Duplicate-tag semantics changed:** 0.x kept multiple `<Meta>` with same `name` if other attrs differed; 1.x **dedupes by `name`/`property`/`http-equiv` (qualified by `media`), last-wins**. Deliberate sets (e.g. multiple `og:image`) go in `<Head>`; fork colliding identities with a distinct `key`.
- **`useHead` moved to Solid itself**: import from `@solidjs/web`; takes `HeadTag` descriptors `{ tag, props, key? }` — single tag, array (group), or function (reactive group):

```ts
import { useHead } from "@solidjs/web";
useHead({ tag: "meta", props: { name: "description", content: () => desc() } });
```

- **Removed:** `escape` prop (everything escaped; text via `textContent`); `ref`/event handlers on head tags (query the DOM); client-dynamic `<Base>`/`<Meta charset>` (server-shell only, dev-warned on client); `noscript` (excluded from core tag union — author statically in the document shell).
- **New:** `<Script>` (JSON-LD etc. without the `useHead` escape hatch); `<Head>` groups children into one replacement set with reactive membership; icons (`rel="icon"`/`rel="apple-touch-icon"`) replace rather than accumulate, unmount restores previous; `theme-color` variants coexist by `media`.

### 5.5 From React — conceptual map

(Summary of the shared-syntax/divergent-model guide; useful for auditing ported code.)

- **Execution model:** React re-runs components; Solid notifies only computations/JSX expressions that read a signal. Accessors are functions; keep reads in JSX/tracking scopes; component bodies run untracked.
- **Hook mapping:** `useState` → `createSignal`; object/collection state → `createStore` (draft setters); cached derivation → `createMemo`; imperative sync → `createEffect`; context → `createContext`/`useContext` (the context object is also its provider component); reusable behavior → custom primitives (plain functions returning primitives — no hook rules).
- **Derived-from-props editable value (the "adjust state when prop changes" React pattern):** in Solid use the function-form signal — `createSignal(() => props.name)` — no effect, no prev-prop bookkeeping.
- **Effects by responsibility:** `useEffect([roomId])` → compute+apply effect; not every React effect is a Solid effect (derive, handle interactions in handlers, async in memos; use an effect only when a settled result must drive an imperative external system).
- **Props:** keep the props object reactive (no destructuring when values change — destructuring reads eagerly and dev warns on top-level reactive reads); `createMemo` for a local reactive name.
- **DOM differences:** `class` not `className`; object `class`; CSS-named styles (`"background-color"`) with no auto units; `textContent`/`innerHTML`; native `onInput` vs `onChange` timing.
- **Lists:** ternary/`&&` work (compiler makes them reactive conditionals); `map` is a plain call (no row identity) → `<For keyed>`; `Repeat` for positional store rendering.
- **Async:** `Suspense` → `Loading`, error boundary → `Errored`, `SuspenseList` → `Reveal` (`"sequential"`/`"together"`/`"natural"`), transitions → automatic held updates + `isPending`, mutation coordination → Solid `action`. Async coordination follows data: a not-ready read blocks that output but not sibling/nested component setup (boundaries only need to be owner-ancestors of reads).
- **Incremental migration:** shell + routing first, framework-independent code, leaf UI, shared state/context, derived state/effects, async, then retire the React root/route boundary. Compiled component values and runtime ownership are not interchangeable — treat a route/page/app-root as the renderer boundary.

---

## 6. Guide: Avoid unnecessary effects (when NOT to use `createEffect`)

Most components don't need `createEffect`. Keep data in the graph (signals/stores/props/memos/async computations) until it reaches JSX, an event, or an imperative system outside Solid. The effect is a terminal consumer of a settled result.

1. **Calculate values when read** — don't effect-copy into a second signal:

```ts
// Avoid
createEffect(() => [firstName(), lastName()], ([f, l]) => setFullName(`${f} ${l}`));
// Prefer
const fullName = () => `${firstName()} ${lastName()}`;
```

Use `createMemo` for multiple consumers or an equality boundary; keep memo computations side-effect-free; keep the call inside JSX/tracking scope.

2. **Async work in a derivation** — computations can return promises; no effect + copied signal:

```ts
const results = createMemo(async () => {
  const value = query().trim();
  if (!value) return [];
  return api.search(value);
});
// read under <Errored> + <Loading>, render with <For each={results()}>
```

Use the function form of `createStore` for nested async data (per-property tracking + reconciliation).

3. **Writable derivation for a local override** (forms/editable fields):

```ts
const [draft, setDraft] = createSignal(() => props.value);
// or nested:
const [draft, setDraft] = createStore(() => props.profile, { name: "", email: "" });
```

Derivation supplies the source until `setDraft` overrides; the override resets when a derivation dependency changes. Use a plain signal/store when the local value has an independent lifetime; use optimistic state for mutation-bound tentative values.

4. **Handle interactions where they happen** — event handlers know the interaction and current values:

```ts
const save = action(function* () {
  yield api.saveProfile(snapshot(draft));
});
<button onClick={() => void save()}>Save</button>;
```

Don't set a `submitted` signal and watch it from an effect (removes the cause, adds a reactive step).

5. **Effect only at an imperative boundary** — when a settled reactive value must drive a system Solid doesn't own (third-party widget, reactive subscription, telemetry, imperative browser APIs). Two-phase API: compute tracks deps; apply is untracked, receives the value, returns cleanup. Extract **every** reactive value needed in the compute phase (the apply phase is untracked).

6. **External observations become new inputs** — APIs that report post-render info (e.g. `ResizeObserver` in an `onSettled`-owned `ref` directive) may write into a signal; that write records downstream browser info, not an upstream copy.

**Pre-flight check before `createEffect`:** (1) derive in JSX/function? (2) memo for reuse/caching/equality? (3) async data → async memo/projected store? (4) temporary override → writable derived signal/store? (5) interaction-driven → event handler/action? (6) one-time owned setup → `onSettled`/ref directive? (7) does a settled result need to leave Solid to drive an imperative system? If #7 is no, don't use an effect.

---

## 7. Guide: Testing

Use the smallest environment that exercises the behavior. Tiered approach: (1) jsdom for component DOM tests; (2) Vitest browser mode (Chromium) for layout/CSS/focus/selection/browser APIs; (3) separate Node project for server code.

**jsdom setup** (the `basic` template pins Vitest 4, jsdom 25, Solid Testing Library 1.0 beta, jest-dom):

```
pnpm add -D vitest@^4.0.0 jsdom@^25.0.1 @solidjs/testing-library@beta @testing-library/jest-dom@^6.6.3
```

```ts
import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";
export default defineConfig({
  plugins: [solid()],
  test: { environment: "jsdom", globals: false, setupFiles: ["./vitest-setup.ts"] },
});
```

`vitest-setup.ts`: `import "@testing-library/jest-dom/vitest";`. The template sets `isolate: false` for a small suite — remove when tests mutate module state (or reset it).

**User-visible interaction test:**

```tsx
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { flush } from "solid-js";
afterEach(cleanup);
test("increments on click", () => {
  const { getByRole } = render(() => <Counter />);
  const button = getByRole("button");
  expect(button).toHaveTextContent("Clicks: 0");
  fireEvent.click(button);
  flush(); // commit the staged signal write + drain queued work
  expect(button).toHaveTextContent("Clicks: 1");
});
```

Pass a function to `render` (reactive owner). Click stages the update; ordinary reads return the last committed value; `flush()` commits before reading DOM. Prefer `await user.click(...)` where the tooling drains event sequences. `globals: false` → explicit `afterEach(cleanup)`.

**Browser mode** (`@vitest/browser-playwright` + `playwright`, `pnpm exec playwright install chromium`): keep jsdom installed — `@solidjs/vite-plugin` supplies a jsdom environment when `test.environment` is unset and Vitest resolves it before starting the browser pool. `browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: "chromium" }] }`. Run with `pnpm test --run`.

**Server tests in a separate Vitest project** (fullstack): `projects: [{ name: "client", environment: "jsdom", include: ["src/**/*.test.tsx"] }, { name: "server", environment: "node", include: ["src/server/**/*.test.ts"], server: { deps: { inline: [/@solidjs/\/web/] } } }]`. The Node project inlines/aliases `@solidjs/web` entries so the request helper + request-event storage share the same server-build instance (e.g. alias `@solidjs/web` → `node_modules/@solidjs/web/dist/server.js`, `@solidjs/web/storage` → `storage/dist/storage.js`). Keep server include patterns separate from client.

**Stub `virtual:env/server`** for tests: a Proxy over `process.env` reproducing the schema's parsed output (e.g. splitting `SESSION_SECRET` on commas, trimming). Set `process.env.SESSION_SECRET` before importing modules that capture env at init (`vi.resetModules()`).

**Session-across-requests pattern:**

```ts
import { commitEventResponse, createRequestEvent } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";

async function runRequest(request, handler) {
  const event = createRequestEvent(request);
  return provideRequestEvent(event, async () => {
    const result = await handler();
    const response = commitEventResponse(new Response("ok"), event);
    return { result, response };
  });
}
```

Assert the public request→response contract (write a cookie, read it on the next request). Reset modules, restore mocks/timers, delete env vars, and dispose process-wide state in `afterEach`.

**Principles:** test the observable result (accessible role + visible text/state), not signal values/effect counts/compiled output. Use async queries for async-by-contract behavior rather than `flush()` as a stand-in.

---

## Appendix: quick gotcha cheat-sheet for auditing existing code

- `Router` is a `createRouter(...)` **instance** now, not a component you configure with JSX children; no `Route`, `A`, `Navigate`, `createMemoryHistory`, `useCurrentMatches`, `createAsync`, `createAsyncStore`, `useSubmission`, `cache`, or router `json()`.
- `useRouter`/`useLocation`/`useNavigate`/`useParams` are the session primitives; instance members (`routes`/`config`/`paths`/`match`) are static app-wide data.
- Link styling = `[data-active]` / `[aria-current="page"]` / `[data-pending]` attribute selectors.
- `query` reads go through async-aware primitives (`createMemo`), never `createAsync`.
- Pending mutation UI = `.onSubmit` + optimistic primitives + `aria-busy`, not `useSubmission().pending`.
- `redirect`/`reload`/`respond` come from `@solidjs/web`, not the router.
- Head: `useHead` from `@solidjs/web`; Solid Meta 1.0 components (`Meta`, `Title`, `Link`, `Script`, `Head`) need no `MetaProvider`; dedupe is name/property/http-equiv last-wins unless wrapped in `<Head>`.
- `@solidjs/meta` 1.0, `@solidjs/router` 2, `@solidjs/web`, and `@solidjs/vite-plugin` 3 are a single coordinated upgrade with `solid-js` 2 RC.
