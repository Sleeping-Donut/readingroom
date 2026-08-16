# Filesystem Routing Conventions

How file-based routing works in this project and how to structure routes correctly.

## Which router & convention

The frontend uses `filesystem-routing` (the `Nested`/`PageFileSystemRouter` convention — the
one proven by SolidStart) wired via `@solidjs/router/fs`:

```ts
// src/router.ts
import { fileRoutes } from "@solidjs/router/fs";
import { pageRoutes } from "virtual:file-routes";

export const Router = createRouter({ routes: fileRoutes(pageRoutes) });
```

The Vite plugin (`filesystem-routing/vite` in `vite.config.ts`) scans `src/routes` and emits
`virtual:file-routes` (regenerated on every build into `src/file-routes.d.ts`).

Reference: the full source is in `references/filesystem-routing/`
(`src/convention.ts`, `src/tree.ts`, `src/flat.ts`).

## Filename → path (Nested convention)

| File | Path |
| --- | --- |
| `index.tsx` | `/` (its directory's path) |
| `about.tsx` | `/about` |
| `blog/[id].tsx` | `/blog/:id` |
| `blog/[[page]].tsx` | `/blog/:page?` (optional) |
| `docs/[...path].tsx` | `/docs/*path` (catch-all; `params.path`) |
| `(marketing)/about.tsx` | `/about`, nested in the `(marketing)` pathless group |

Module convention: the default export is the page component; an optional `route` export
(`defineFileRoute(path, config)`) carries `preload`, `matchFilters`, `search`, `info`.

## How layouts actually work (important)

The Vite plugin emits a *flat* manifest, then `buildRouteTree` (in `tree.ts`) nests every
route under the route whose path is its prefix. **That prefix-parent becomes a layout**: the
router renders it and passes the matched child through `props.children`. A layout must render
`{props.children}`, or nested pages silently render the layout's own content instead of the child.

## The three "equivalent" settings layouts — they are not equivalent

All three create a `/settings` subtree, but differ in whether `/settings` has a landing leaf
and in who the layout is:

### 1. `settings.tsx` + `settings/thing.tsx` — the documented layout pairing
```text
src/routes/settings.tsx        # /settings layout
src/routes/settings/thing.tsx  # /settings/thing
```
- `settings.tsx` is the layout for everything under `settings/`.
- `/settings` alone has **no leaf** → blank main. You need an `index.tsx` for a landing.
- ✅ Clear, code-splits, shared chrome. ❌ Requires the layout to forward `children` and an
  `index.tsx` if `/settings` should render anything.

### 2. `settings/index.tsx` + `settings/thing.tsx` — the footgun (avoid)
```text
src/routes/settings/index.tsx  # /settings
src/routes/settings/thing.tsx  # /settings/thing
```
- `index.tsx` becomes the `/settings` page **and**, because the tree nests by path prefix, it
  *implicitly becomes the layout* for `/settings/thing`.
- If `index.tsx` doesn't render `props.children`, `/settings/thing` shows the index content
  instead of `thing`. This is the same class of bug we hit in this repo.
- ✅ Fewer files. ❌ Surprising, fragile.

### 3. `settings/(general).tsx` + `settings/thing.tsx` — pathless layout (unusual)
```text
src/routes/settings/(general).tsx  # pathless layout for the /settings subtree
src/routes/settings/thing.tsx
```
- `(general)` is a URL-stripped group segment, so the file is a pathless layout for
  `/settings/thing`. No `/settings` landing without an `index.tsx`.
- Groups are normally **directories** (`(marketing)/about.tsx`), not files. Reading a
  `(general).tsx` file as a layout is unusual.

## Recommended structure for this project

Use pattern 1 with an explicit index — this is what the repo already does:

```text
src/routes/settings.tsx           # layout: header + tab nav + {props.children}
src/routes/settings/index.tsx     # /settings landing (renders Indexers)
src/routes/settings/library.tsx
src/routes/settings/indexers.tsx
src/routes/settings/clients.tsx
src/routes/settings/notifications.tsx
src/routes/settings/account.tsx
src/routes/settings/integrations.tsx
```

Rules of thumb:
- A section with shared chrome and a landing page → **`section.tsx` layout + `section/index.tsx` + leaves**.
- A section with no landing needed → **`section.tsx` layout + leaves** (no `index.tsx`).
- Pathless grouping of URLs that shouldn't own a segment → **`(auth)/login.tsx`** style directory
  groups (e.g. shared auth layout for `/login`, `/register`).
- Catch-all detail routes that accept both ids and foreign ids → **`[...id].tsx`**
  (e.g. `books/[...id].tsx` → `/books/*id`, so `/books/works/OL46241W` matches).

## Pitfalls

- **Layouts must forward children.** A layout that doesn't render `{props.children}` breaks
  every nested page under it.
- **`index.tsx` alone becomes an implicit layout** for sibling sub-paths — prefer an explicit
  layout file so the intent is obvious.
- **`defineFileRoute`'s path string is a type witness**, not the runtime path. The manifest
  path (from the filename) wins. A `route.originalPath` from the manifest can be `"/"` for an
  index leaf — handle that when reading the active route (see the settings nav `activeSlug`).
- The **flat convention** (`files.$.tsx`, `_auth.login.tsx`, `concerts.tsx` layout for
  `concerts.*`) exists in `filesystem-routing` but is a different router config — this project
  uses the Nested convention, so don't mix filename styles.
