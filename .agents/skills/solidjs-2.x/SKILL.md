---
name: solidjs
description: Use when writing or reviewing Solidjs 2 code
---

# SolidJS 2

Components run once; reactivity is granular — no whole-tree re-renders.

## Rules

- `createSignal` (getter/setter), `createMemo` for derived, `createEffect` for side effects. `createEffect` has separate compute/effect phases; prefer derivation over effects.
- Use `For`, `Show`, `Switch`/`Match`, `Repeat` over `.map()`/ternaries/`&&` in JSX.
- Async is first-class: reactive primitives accept promises and (async) iterators. Wrap pending reads in `<Loading>` / `<Errored>` / `<Reveal>`.
- `createStore` (deep proxy), `createProjection` (derived), `reconcile` (merge), `merge`/`omit` (props proxies).
- Writes spanning async gaps: `action` + `createOptimistic`/`createOptimisticStore`, `affects`, `onSettled`/`refresh`.
- Router: `createRouter` + typed paths + `query`/`action`. Head/SSR: `@solidjs/meta`, `useHead`, `clientOnly`, `renderToStream`/`renderToString`.

## More

Fetch and read the relevant pages: `https://v2.solidjs.com/llms.txt` (or `llms-full.txt`)

