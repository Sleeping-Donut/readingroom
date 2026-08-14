# Solid 2.0 (RC) Core Concepts Reference

> Compiled from the official docs at https://v2.solidjs.com/ (pages fetched 2026-08-14).
> All 11 requested pages loaded successfully. This reference captures new/changed APIs,
> idioms, patterns, and gotchas for auditing code against idiomatic Solid 2.0 usage.
> Note: `httpStatus` / `httpHeader` were **not** covered on the fetched `/concepts/rendering-and-ssr`
> page — they are likely documented under `/building-apps/middleware-and-api-routes` (not in scope here).

---

## Getting Started

### Quick start

- Requires Node.js `20.19+` or `22.12+` (satisfies the Vite 8 runtime requirement).
- Scaffold with the Solid CLI:
  ```bash
  npm init solid@latest        # or pnpm create solid@latest / yarn create solid@latest / bun create solid@latest
  ```
- The `basic` project shape includes: file-system router, per-page titles, a test suite, and a **purely static** production build.
- Start-mode templates have **no hand-written `index.html` or mount file**. The Vite plugin's start mode generates entries around two files:
  - `src/App.tsx` — the app (router included).
  - `src/Document.tsx` — the document shell; site-wide head tags go here.
- Static production build emits `dist/client/index.html`.
- Three project shapes (each a strict superset of the last):
  - `bare`: Solid only, `vite build` emits a purely static site.
  - `basic`: router + file-system routes + per-page titles + testing; still static, deploy `dist/client`.
  - `fullstack`: streaming SSR, server functions, sessions, API routes; `dist/client` plus a request handler in `dist/server`.
- Moving up a tier does **not** change app structure — the `src/App.tsx` / `src/Document.tsx` conventions carry through.

### Project shapes

- SSR is enabled with one boolean in `vite.config.ts`:
  ```ts
  import { defineConfig } from "vite";
  import solid from "@solidjs/vite-plugin";

  export default defineConfig({
    plugins: [
      solid({
        start: true,
        ssr: true, // remove for a static shell rendered on the client
      }),
    ],
  });
  ```
- Application code must be safe to evaluate on the server; move browser-only APIs behind client lifecycle code or a client-only boundary, and keep initial server/client output deterministic.
- With `ssr: false` (client mode): the document shell is prerendered as static HTML and pages render in the browser. With `ssr: true`: pages stream from the server and hydrate.
- **`fullstack` deployment**: the built server entry exports `handleRequest(request)` — a fetch-compatible `Request -> Promise<Response>` handler.
  ```ts
  import { handleRequest } from "./dist/server/server.js";
  const response = await handleRequest(request);
  ```

---

## Reactivity

### Mental model

1. A signal or store property is a source of reactive state.
2. Reading a source inside a tracking scope subscribes that scope to the source.
3. Writing to a source stages a new value and notifies its subscribers.
4. Solid drains the pending work as **one update pass on the microtask queue**.

- Dependencies follow the reads of the **latest run**. If a computation takes a different branch, old-branch reads stop being dependencies and new-branch reads become dependencies.

### Signals

- `createSignal` returns an accessor + setter. Reading inside a tracking scope creates a dependency; reading outside returns the current value with no subscription.
- **Updater functions compose** — several writes before a flush each receive the latest staged value:
  ```tsx
  import { createSignal } from "solid-js";

  export function Counter() {
    const [count, setCount] = createSignal(0);
    const doubled = () => count() * 2;

    return (
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        {count()} × 2 = {doubled()}
      </button>
    );
  }
  ```
- **Gotcha**: reactive reads belong in JSX or another tracking scope, not the top level of a component body. Component bodies run **untracked**; a top-level read is a one-time snapshot and produces a **development warning**.

### Memos

- A memo is a **read-only derived value** that caches its result for downstream readers; the compute tracks its sources, and downstream consumers are notified only when the result changes per the memo's equality rule.
- Plain derived functions (`const doubled = () => count() * 2`) are often enough — a memo is only needed for multiple consumers or to form an **equality boundary** in the reactive graph.
- **Gotcha**: a memo's value does **not** update until `flush()`:
  ```ts
  import { createMemo, createRoot, createSignal, flush } from "solid-js";

  const model = createRoot((dispose) => {
    const [first, setFirst] = createSignal("Ada");
    const [last] = createSignal("Lovelace");
    const fullName = createMemo(() => `${first()} ${last()}`);
    return { fullName, setFirst, dispose };
  });

  console.log(model.fullName()); // "Ada Lovelace"
  model.setFirst("Grace");
  console.log(model.fullName()); // "Ada Lovelace"  (stale until flush)
  flush();
  console.log(model.fullName()); // "Grace Lovelace"
  model.dispose();
  ```

### Effects (split compute/apply)

- **Solid 2.0 change**: `createEffect` now has a **tracked compute phase** and an **untracked effect phase**. The value returned by the compute function is passed to the effect function **after the queue flushes**:
  ```ts
  import { createEffect, createRoot, createSignal, flush } from "solid-js";

  const counter = createRoot((dispose) => {
    const [count, setCount] = createSignal(0);

    createEffect(
      () => count(), // tracked compute phase
      (value, previous) => console.log({ previous, value }) // untracked apply phase
    );

    return { setCount, dispose };
  });

  flush(); // logs { previous: undefined, value: 0 }
  counter.setCount((value) => value + 1);
  flush(); // logs { previous: 0, value: 1 }
  counter.dispose();
  ```
- **Gotcha**: every reactive read that should retrigger the effect goes in the **compute** function. Reads in the effect function do **not** become dependencies.
- The effect function may return a cleanup function, which runs before the next effect invocation and on disposal.
- Use effects only for imperative output (logger, DOM API, subscription). Use a derived function or memo when other reactive code needs the result.

### Update scheduling / batching

- Signal and store writes are **batched by default**. A setter stages its value; ordinary reads keep returning the committed value until Solid drains the queue in a microtask. Several writes in the same turn update downstream computations together.
- Use `flush()` when a test or imperative integration must observe pending writes synchronously. `flush(fn)` runs the callback in a synchronous flush scope and drains before returning.

### Ownership and disposal

- Reactive computations are organized under **owners**. Memos, effects, and cleanups created while an owner is current attach to that owner; disposing the owner removes its child computations and subscriptions.
- Children created by a computation are also disposed **before that computation runs again**.
- Components provide an owner for their lifetime. Use `createRoot` to host a reactive scope outside a component and call its disposer to end it. **Gotcha**: creating an effect without an owner leaves no lifecycle that can dispose it.

---

## Stores

- A store represents object/array state through a **reactive proxy**. Property syntax (not accessors); nested objects/arrays are exposed through reactive proxies; each property read is tracked.
- **Decision rule**: use a signal when a value is read and replaced as one unit; use a store when consumers read/update separate parts of a nested object or collection.

### Create nested state

```ts
import { createEffect, createRoot, createStore, flush } from "solid-js";

type Todo = { id: string; text: string; done: boolean };

const model = createRoot((dispose) => {
  const [state, setState] = createStore({
    profile: { name: "Ada", online: false },
    todos: [] as Todo[],
  });

  createEffect(
    () => state.profile.name,
    (name) => console.log(`Name: ${name}`)
  );

  return { state, setState, dispose };
});

flush(); // logs "Name: Ada"
model.setState((draft) => {
  draft.profile.name = "Grace";
  draft.todos.push({ id: "1", text: "Write docs", done: false });
});
flush(); // logs "Name: Grace"
model.dispose();
```

- Reading `state.profile.name` in a tracking scope subscribes that scope to the **nested `name`** property; writes to other properties do not notify it. Property tracking nodes are created lazily as consumers read each property.
- Store properties are **values**, not accessors — read `state.profile.name`, not `state.profile.name()`. Keep the property access inside JSX, a memo, or an effect compute function.

### Update with a draft (draft-first setter)

- **Solid 2.0 change**: the store setter receives a **mutable draft** — the produce-style update API. Mutate with normal property assignment and array methods:
  ```ts
  model.setState((draft) => {
    draft.profile.online = true;
    const todo = draft.todos.find((todo) => todo.id === "1");
    if (todo) todo.done = true;
  });
  ```
- The callback may instead **return a replacement value**:
  - For arrays: writes returned entries by index and adjusts length.
  - For objects: shallowly writes present keys and deletes keys missing from the returned object.
  ```ts
  const [todos, setTodos] = createStore<Todo[]>([
    { id: "1", text: "Write docs", done: true },
    { id: "2", text: "Review examples", done: false },
  ]);
  setTodos((current) => current.filter((todo) => !todo.done));
  ```
- **Gotcha**: returning a collection does **not** perform keyed reconciliation. Use a **projection** when items that survive a replacement need to retain their store identity.
- `storePath` remains available as an optional path-based helper; the draft callback is the primary setter form:
  ```ts
  import { storePath } from "solid-js";
  model.setState(storePath("profile", "name", "Katherine"));
  ```
- Store writes use the same microtask batching as signal writes.

### Derive a store with a projection

- **New in 2.0**: a **projection** is derived state with store-shaped, per-property tracking. `createProjection` returns a read-only store; the **function form of `createStore`** returns a projected store with a setter.
- For a derived scalar or a value consumed as one unit, use a memo instead.
- The projection function receives a **draft** and may mutate it or return a replacement. Returned collections are **reconciled by `id` by default**, preserving surviving items' proxy identity. Pass another key for a different identity field, or `null` for positional reconciliation.
- **The required seed** is the backing object/array for the projected store. Each result reconciles into the same projected store, so the **root proxy keeps its identity**.
- For an **async projection**, the seed is not a committed first result by default (see Async reactivity; `seedLoadingValue` is the escape hatch).
  ```ts
  import { createProjection, createRoot, createSignal, createStore, flush } from "solid-js";

  type Todo = { id: string; text: string; done: boolean };

  const list = createRoot((dispose) => {
    const [todos] = createStore<Todo[]>([
      { id: "1", text: "Write docs", done: true },
      { id: "2", text: "Review examples", done: false },
    ]);
    const [includeDone, setIncludeDone] = createSignal(false);
    const visible = createProjection(
      () => todos.filter((todo) => includeDone() || !todo.done),
      []
    );
    return { visible, setIncludeDone, dispose };
  });

  console.log(list.visible.map((todo) => todo.text)); // ["Review examples"]
  list.setIncludeDone(true);
  flush();
  console.log(list.visible.map((todo) => todo.text)); // ["Write docs", "Review examples"]
  list.dispose();
  ```

### Optimistic stores

- `createOptimisticStore` has the same nested draft update model with a **tentative overlay**: tentative writes are visible immediately; when the action settles, Solid removes the overlay and reveals the authoritative store value.
  ```ts
  import { action, createOptimisticStore } from "solid-js";

  const [profile, setProfile] = createOptimisticStore({ name: "Ada" });

  const rename = action(function* (name: string) {
    setProfile((draft) => {
      draft.name = name;
    });
    console.log(profile.name); // "Grace" during rename("Grace")
    yield Promise.resolve();
  });

  await rename("Grace");
  console.log(profile.name); // "Ada"
  ```
- The **derived form** recomputes an authoritative value through a projection. When fresh projected data lands, it updates base state and clears stale optimistic overlays — useful when an action shows an expected collection update before refreshing its source.

---

## Components and JSX

### How JSX executes

- JSX compiles to renderer operations — no virtual DOM to rebuild and compare. Lowercase names = native elements; capital names = components.
- A component function runs when Solid mounts it; compiled JSX invokes component functions through `createComponent`, which runs the function **untracked** so reactive reads in the body do not subscribe the parent computation.
- The expression `{count()}` runs in a tracking scope and updates when `count` changes.

### Props

- Parents pass data through JSX props; the child receives one props object. Compiled component props can use **getters**, so an expression like `name={selected().name}` stays reactive until the receiving component reads `props.name`.
- Read reactive props inside JSX, a memo, or an effect.
- **Gotcha (dev warning)**: reading a reactive prop into a local variable at the top level of a component (including **destructuring reactive props in the parameter list**) captures the read outside a tracking scope. Keep the props object intact, or derive a local value with `createMemo`:
  ```tsx
  import { createMemo } from "solid-js";

  function FullName(props: { first: string; last: string }) {
    const fullName = createMemo(() => `${props.first} ${props.last}`);
    return <span>{fullName()}</span>;
  }
  ```

### Handling events

- Pass a function to a camelCase event prop (`onClick`, `onInput`). Solid **delegates** supported events through the owning render/hydration root. Handlers run on browser dispatch, so reactive reads inside use current values.
- Use a `ref` with `addEventListener` when you need native listener options (capture/passive).

### Refs and directives

- **Solid 2.0 change**: ref callbacks + directive factories replace the `use:` namespace. A `ref` callback receives the element after creation.
  ```tsx
  function SearchField() {
    let input!: HTMLInputElement;
    return (
      <>
        <input ref={(element) => (input = element)} type="search" />
        <button type="button" onClick={() => input.select()}>Select query</button>
      </>
    );
  }
  ```
- A **directive factory** creates owned reactive primitives during component setup and returns the callback that applies the directive to an element.
- **Gotcha**: ref callbacks run **untracked and without an owner** — do not create effects or register cleanup inside the returned callback. Create them in the factory, where they belong to the component owner:
  ```ts
  import { onSettled } from "solid-js";

  function listen(type: string, listener: EventListener, options?: AddEventListenerOptions) {
    let element: HTMLElement | undefined;

    onSettled(() => {
      const target = element;
      if (!target) return;
      target.addEventListener(type, listener, options);
      return () => target.removeEventListener(type, listener, options);
    });

    return (next: HTMLElement) => {
      element = next;
    };
  }
  ```
- The `ref` prop also accepts an **array**; Solid recursively flattens and calls each callback in order, composing element access, reusable directives, and third-party integrations:
  ```tsx
  <input
    type="search"
    ref={[
      (element) => (input = element),
      autofocus,
      listen("input", props.onInput, { passive: true }),
    ]}
  />
  ```
- Ref callback return values are ignored; register cleanup through an owned primitive such as `onSettled`.

### Classes (object form)

- **Solid 2.0 change**: `class` accepts strings, **objects**, and **nested arrays**. The `classList` prop from Solid 1 is **replaced** by the object/array forms of `class`.
  ```tsx
  <button
    class={[
      "button",
      props.class,
      {
        active: props.active,
        "saving muted": props.saving, // keys may contain several class names
      },
    ]}
  >
    Save
  </button>
  ```
- Put conditional names in an **object** instead of string concatenation / `filter(Boolean)` / `join`, so Solid can add/remove the affected class tokens directly.

### Children and composition

- A component accepts children only when its props type includes `children`. Use `ParentProps` for optional element children or write a specific children type for a render callback.
- Use the `children` helper to resolve/inspect/iterate children; it returns an accessor with `toArray()`:
  ```tsx
  import { children, type ParentProps } from "solid-js";

  function Stack(props: ParentProps) {
    const resolved = children(() => props.children);
    return <div class="stack">{resolved.toArray()}</div>;
  }
  ```
- Function children are used by control-flow components for narrowed values and list rows.

### Context

- `createContext` returns a context that is **also its provider component** (new component-style usage); `useContext` reads the value for the current owner.
  ```tsx
  import { createContext, useContext, type ParentProps } from "solid-js";

  type Theme = "light" | "dark";
  const ThemeContext = createContext<Theme>("light");

  function ThemeProvider(props: ParentProps<{ value: Theme }>) {
    return <ThemeContext value={props.value}>{props.children}</ThemeContext>;
  }

  function ThemeButton() {
    const theme = useContext(ThemeContext);
    return <button class={theme}>Save</button>;
  }
  ```
- With a default value, `useContext` returns it outside a provider; without a default, reading outside a provider throws `ContextNotFoundError`. Providers create a scoped owner, so nested providers can replace a value for their descendants.

### Rendering lists

- **`For`** — for arrays. Default **keyed** mode reuses the mapped row for an item with the same identity; callback receives the raw item and a reactive index accessor:
  ```tsx
  import { For, createSignal } from "solid-js";

  function TodoList() {
    const [todos] = createSignal<Todo[]>([
      { id: 1, text: "Read the guide" },
      { id: 2, text: "Build an example" },
    ]);
    return (
      <ul>
        <For each={todos()} fallback={<li>No tasks</li>}>
          {(todo, index) => (
            <li>{index() + 1}. {todo.text}</li>
          )}
        </For>
      </ul>
    );
  }
  ```
  - `keyed={false}` → position-based mapping (item accessor + stable numeric index). A key function → accessors for both item and index.
- **`Repeat`** (new in 2.0) — positional rendering **over a store**, from a numeric range instead of diffing arrays/identities. Each row reads its store position directly, so a store update notifies only expressions that read changed properties:
  ```tsx
  import { Repeat, createSignal, createStore } from "solid-js";

  function ActivityLog() {
    const [rows] = createStore(
      Array.from({ length: 1_000 }, (_, id) => ({ id, message: `Activity ${id}` }))
    );
    const [from, setFrom] = createSignal(0);
    const size = 20;

    return (
      <>
        <button onClick={() => setFrom((index) => Math.min(index + 1, rows.length - size))}>
          Next
        </button>
        <ul>
          <Repeat from={from()} count={Math.min(size, rows.length - from())}>
            {(index) => <li>{rows[index].message}</li>}
          </Repeat>
        </ul>
      </>
    );
  }
  ```
  - `from` + `count` render a **sliding window** without creating a sliced array; rows preserved in range, disposed out of range, created for new indexes.

### Conditional content

- **`Show`** — renders children when `when` is truthy, `fallback` otherwise. Default function-child form receives an accessor for the narrowed value and preserves the child while `when` stays truthy:
  ```tsx
  <Show when={user()} fallback={<a href="/sign-in">Sign in</a>}>
    {(current) => <p>Signed in as {current().name}</p>}
  </Show>
  ```
  - With `keyed`, the callback receives the raw narrowed value and the child remounts when identity changes.
- **`Switch` / `Match`** — mutually exclusive conditions; renders the first truthy `Match`, or fallback. Same keyed/non-keyed function-child rules as `Show`.

### Dynamic components

- **New in 2.0**: import `dynamic` from `@solidjs/web`. `dynamic()` selects a component or native element from a reactive source, returning a stable component reference that forwards props and children:
  ```tsx
  import { createSignal, type Component } from "solid-js";
  import { dynamic } from "@solidjs/web";

  const Compact: Component<{ value: string }> = (props) => <span>{props.value}</span>;
  const Detailed: Component<{ value: string }> = (props) => <strong>{props.value}</strong>;
  const [detailed, setDetailed] = createSignal(false);
  const Result = dynamic(() => (detailed() ? Detailed : Compact));

  export function Preview() {
    return (
      <>
        <button onClick={() => setDetailed((value) => !value)}>Toggle detail</button>
        <Result value="Current result" />
      </>
    );
  }
  ```
  - The source may also resolve to a native tag name or an async component.

---

## Async Reactivity

### Settled view and in-flight work

- Core model: separate the **answer currently visible** from the **work that may produce another answer**.
- Before the first answer settles, there is no value to render. After an answer settles, Solid **holds the committed view** while work prepares the next answer; other writes in the same update wait and commit together when pending work settles.
- **This held update is automatic** — a `Loading` boundary does not create the hold; it only controls what renders when no settled answer exists. Each async primitive closes a specific gap rather than creating a separate async state model.

### No settled answer: `Loading`

- Reading an async source before its first result reports "not ready"; a `Loading` boundary turns that into fallback UI:
  ```tsx
  import { Loading, createMemo, createSignal } from "solid-js";

  function UserProfile() {
    const [id, setId] = createSignal(1);
    const user = createMemo(async (): Promise<User> => {
      const requestedId = id();
      const response = await fetch(`/api/users/${requestedId}`);
      if (!response.ok) throw new Error(`Could not load user ${requestedId}`);
      return response.json();
    });

    return (
      <section>
        <button onClick={() => setId((current) => current + 1)}>Next user</button>
        <Loading fallback={<p>Loading profile...</p>}>
          <article>
            <h2>{user().name}</h2>
            <p>{user().bio}</p>
          </article>
        </Loading>
      </section>
    );
  }
  ```
- **Key pattern**: `createMemo(async () => ...)` returns a value, not a promise — consumers still read `user()` as a reactive value.

### Another answer is coming: `isPending`

- After the first answer settles, use `isPending(fn)` to detect an in-flight replacement for the visible content:
  ```tsx
  <Loading fallback={<p>Loading profile...</p>}>
    <article aria-busy={isPending(user) ? "true" : "false"} class={{ updating: isPending(user) }}>
      <h2>{user().name}</h2>
      <p>{user().bio}</p>
    </article>
  </Loading>
  ```
- `isPending` evaluates its expression; `true` when another answer is in flight and unrevealed. If no settled answer yet, the read still follows the surrounding `Loading` path.

### Work rejects: `Errored`

- Async rejections travel through the reactive graph; `Errored` turns an unhandled error into recoverable UI:
  ```tsx
  <Errored
    fallback={(error, reset) => (
      <section>
        <p>{String(error())}</p>
        <button onClick={reset}>Retry</button>
      </section>
    )}
  >
    <Loading fallback={<p>Loading profile...</p>}>
      <UserDetails user={user()} />
    </Loading>
  </Errored>
  ```
- `Loading` and `Errored` handle **separate states**: a loading boundary does not consume errors, and an error boundary does not replace loading UI.

### Mutations: `action` and optimistic state

- `action(generator)` runs a generator/async generator as a **transaction**. Each `yield` waits for its value and restores the action's transaction before the generator continues. The returned action is an async function for event handlers/imperative scopes.
- `createOptimistic` and `createOptimisticStore` provide writable state for the expected result of a mutation. Writes are visible immediately inside an action and **tentative** until the transaction finishes; a failed action reverts the tentative write.
- **Common mutation timeline**:
  1. Start an `action`.
  2. Write the expected result to optimistic state.
  3. `yield` the durable operation.
  4. Call `refresh(source)` to read durable truth again.
  5. Settle the action and remove its optimistic overlay.
- **Layer state by lifetime** (recommended composition, fixed order):
  1. **Persistent data** — from the async projection (server / browser DB / durable source).
  2. **Ephemeral UI state** — recoverable errors, drafts, notices that survive rollback; projection applies this to the persistent result.
  3. **Optimistic state** — expected result of the active mutation; `createOptimisticStore` applies it last, removes it on settle.
  - Consumers read the composed store; the primitive composition enforces the layer order.
  - Full worked example (in the docs): `createTodos()` builds all three layers under the component owner and returns one composed store with actions — avoiding module-scope reactive state and cross-request sharing. The `errors` map is not reactive; `refresh(todos)` reruns the projection after each mutation to make its entries visible. The action catches expected mutation failures (row recovers locally); unhandled projection/render errors still reach `Errored`.

### Additional control

- **`affects(target, key?)`** — declares that in-flight work can change the targeted data; consumers read that source/store/property as pending while such work is in flight. Independent from optimism (can use both). Pair `affects(source)` with `refresh(source)` when the reload itself should make consumers report pending.
- **`latest(fn)`** — reads the freshest in-flight value: if a next answer exists it returns it before the held update commits; otherwise the visible settled answer; before any answer, follows the normal `Loading` path. Typical use: autocomplete/typeahead keeping results visible while the next value loads.
  ```ts
  const nextUser = () => latest(user);
  ```
- **`loadingValue` / `seedLoadingValue`** — escape hatches only for when a source must return a **declared committed value** during its first async flight (`loadingValue` for signal-family sources, `seedLoadingValue` for projected stores). These bypass `Loading` for the first flight and remain `isPending`-false until the first value lands.

### Queue completion

- `flush()` drains the reactive queue synchronously; `flush(fn)` runs a callback in a synchronous flush scope. Useful in tests/imperative integrations.
- `resolve(fn)` — **outside a tracking scope**, await one reactive expression; resolves with the first settled value or rejects with its error.
- `onSettled(callback)` — register one callback to run after pending async reads under the current owner resolve and the reactive queue flushes. **Reads inside the callback are untracked**; another settle requires another registration. In an owned scope the callback can return a cleanup function for owner disposal. This is the idiomatic primitive for ref-directive setup/cleanup (see Refs and directives):
  ```ts
  import { onSettled } from "solid-js";

  function SearchResults() {
    let searchInput!: HTMLInputElement;
    onSettled(() => {
      const controller = new AbortController();
      const focusSearch = (event: KeyboardEvent) => {
        if (event.key === "/") {
          event.preventDefault();
          searchInput.focus();
        }
      };
      window.addEventListener("keydown", focusSearch, { signal: controller.signal });
      return () => controller.abort();
    });
    return <input ref={(element) => (searchInput = element)} type="search" aria-label="Search" />;
  }
  ```

### Tracking across async gaps

- **Dependency tracking is synchronous.** Reads before the first `await` become dependencies; reads after an `await` do **not** create dependency edges, so later updates to those sources cannot invalidate the computation.
- **Idiom: read every reactive input before the first async gap**:
  ```ts
  const profile = createMemo(async () => {
    const userId = id();
    const permission = permissions();
    const response = await fetch(`/api/users/${userId}`);
    const user = await response.json();
    return { user, permission };
  });
  ```
- **Gotcha**: a source *first* read after `await` cannot notify the computation when it settles. Development builds convert that unresolved read into an error that can reach `Errored`; **production builds do not** — the unsupported pattern can remain pending without a retry. A post-`await` re-read can retry only if the same source was already tracked before the first `await`.
- **Async generators with `action`**: a plain `await` does not restore the action transaction for writes to sources not written earlier. Use `yield promise` as the suspension point, or place a bare `yield` before writing after an `await`.

### Capability map

| Need | Primitive |
|---|---|
| Async source | return a promise/async iterable from a computation |
| No settled answer | `Loading` |
| Unrevealed replacement / `affects` declaration | `isPending` |
| Errors reaching the reactive graph | `Errored` |
| Coordinate writes across async gaps | `action` |
| Show expected result until action settles | `createOptimistic` / `createOptimisticStore` |
| Rerun a derived source with same inputs | `refresh` |
| Declare which data in-flight work can change | `affects` |
| Read freshest in-flight value | `latest` |
| Await one reactive expression (outside tracking) | `resolve` |
| Run code after owned async work + queued updates settle | `onSettled` |
| Committed value before first result (only when needed) | `loadingValue` / `seedLoadingValue` |

---

## Boundaries

- Boundaries turn reactive-graph **status** into renderable UI: `Loading` (unresolved async reads), `Errored` (errors), `Reveal` (coordinates sibling loading reveal order).
- A boundary handles status from the reactive work in its subtree; the **nearest matching boundary** handles it. Loading and error status remain **separate** — `Loading` does not hide errors, `Errored` does not replace loading UI — so both can protect the same region.
- `Errored` + `Loading` composition with an `on` prop for retriggering fallback:
  ```tsx
  <Errored
    fallback={(error, reset) => (
      <section>
        <p>{String(error())}</p>
        <button onClick={reset}>Retry</button>
      </section>
    )}
  >
    <Loading on={accountId()} fallback={<p>Loading account...</p>}>
      <h2>{account().name}</h2>
    </Loading>
  </Errored>
  ```

### Loading boundaries

- `Loading` renders `fallback` while async values read by its subtree have not produced the content the boundary needs; it observes **not-ready reads** from computations reached through that subtree. The nearest eligible loading boundary owns the fallback.
- After displaying content, a boundary **keeps content visible** during later async updates (the automatic hold). Use `isPending` in the content for an updating indicator.
- `on` prop: change to a particular value makes an **initialized** boundary eligible to show its fallback again. **`on` is a value, not an accessor** (e.g. `on={accountId()}` compares identifiers across pending updates); pending work caused by other values leaves initialized content in place.
- Place a loading boundary around the **smallest coherent region** its fallback replaces; keep navigation/forms/controls outside when they must stay available. Use nested boundaries for independent regions.

### Error boundaries

- `Errored` catches uncaught errors (async rejections and synchronous computation errors use the same error-status path) and renders fallback content. Place it around the smallest region that fails and recovers as one unit.
- Fallback: static element or function receiving an error accessor + `reset` (retries the reactive sources collected by the boundary).
- **Gotcha**: an error thrown while rendering an `Errored` fallback is outside that boundary's protected subtree — a parent `Errored` can catch it. Without a matching error boundary, an unhandled error is escalated, not consumed by a loading boundary.

### Reveal order

- `Reveal` coordinates loading boundaries **created directly within it**, changing reveal timing without changing which sources each `Loading` observes. It does not fetch data or create loading state.
- Orders:
  - **`sequential`** (default): reveals slots in registration order; a later slot stays on fallback until every earlier slot is ready.
  - **`collapsed`**: sequential slots after the current frontier render no fallback; only the frontier fallback remains visible.
  - **`together`**: holds every direct slot until all are minimally ready, then releases the group together.
  - **`natural`**: each slot reveals when its own data resolves; at the top level equals uncoordinated. Purpose is nesting — the natural group participates as one composite slot in an outer order.
  ```tsx
  import { Loading, Reveal } from "solid-js";

  function ProfilePage() {
    return (
      <Reveal>
        <Loading fallback={<HeaderSkeleton />}><ProfileHeader /></Loading>
        <Reveal order="natural">
          <Loading fallback={<CardSkeleton />}><RecentPosts /></Loading>
          <Loading fallback={<CardSkeleton />}><Recommendations /></Loading>
        </Reveal>
        <Loading fallback={<FooterSkeleton />}><ProfileFooter /></Loading>
      </Reveal>
    );
  }
  ```
- **Membership rules** (structural): a `Loading` joins the nearest `Reveal` present when created. Nested `Loading`/`Errored` start a separate boundary scope — loading boundaries nested inside another `Loading` are **not** extra slots in the outer reveal group, and a loading boundary wrapped by `Errored` does not delay an ancestor group. A nested `Reveal` registers its controller as **one composite slot** with the parent group; an outer hold propagates through it. To make a region reveal independently, move it outside the outer `Reveal`.

### Primitive forms

- `createLoadingBoundary(fn, fallback, options?)` — accessor switching between tracked `fn` and fallback; its `on` option accepts an accessor (the primitive receives no JSX props).
- `createErrorBoundary(fn, fallback)` — accessor; passes the fallback an error accessor + reset.
- `createRevealOrder(fn, options?)` — runs `fn` under a reveal controller; `order`/`collapsed` options are accessors; nested controllers follow the composite-slot rules.
- Example composing primitives into a custom boundary component:
  ```tsx
  import { createErrorBoundary, createLoadingBoundary } from "solid-js";

  function StatusBoundary(props: { children: JSX.Element; loading: JSX.Element }) {
    const output = createErrorBoundary(
      () =>
        createLoadingBoundary(() => props.children, () => props.loading)(),
      (error, reset) => (
        <section>
          <p>{String(error())}</p>
          <button onClick={reset}>Retry</button>
        </section>
      )
    );
    return output() as JSX.Element;
  }
  ```

---

## Rendering and SSR

- Same component source for client rendering and SSR; the JSX build target selects DOM operations (browser) or HTML-producing operations (server).
- All render entry points live in **`@solidjs/web`** (not `solid-js`).

### Client rendering: `render`

- `render(() => <App />, root)` mounts a client-rendered tree and returns a disposer that tears down the tree and its reactive scopes.
  ```tsx
  import { render } from "@solidjs/web";
  import { App } from "./App";

  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app");
  const dispose = render(() => <App />, root);
  ```
- Pass a function so Solid creates the root before evaluating the tree. The root owns delegated event listeners; disposal removes them. Initial attachment is scheduled through the effect queue. If the initial render has **no unresolved async read**, `render` flushes that work before returning; otherwise the initial mount waits and attaches after it settles.

### Hydration: `hydrate`

- `hydrate(() => <App />, root)` claims existing server-rendered nodes and attaches handlers/bindings without reconstructing nodes; returns a disposer (DOM nodes stay in place).
- Server and client must render the same initial structure per hydrated region. Solid assigns hydration keys and serializes hydration state during SSR.
- When the app owns the full document, include `HydrationScript` once before the application markup (initializes hydration support and captures configured delegated events that occur before the client bundle hydrates).
- **Multiple roots**: give each server render a distinct `renderId` and pass the same value to its `hydrate` call:
  ```ts
  // Server
  const accountHtml = renderToString(() => <Account />, { renderId: "account" });
  // Client
  hydrate(() => <Account />, accountRoot, { renderId: "account" });
  ```

### Synchronous string rendering: `renderToString`

- Runs a component tree synchronously and returns an HTML string. Use when the tree completes synchronously or when pending content is enclosed by a `Loading` boundary whose fallback is suitable:
  ```tsx
  const html = renderToString(() => (
    <Loading fallback={<main>Loading…</main>}>
      <App />
    </Loading>
  ));
  ```
- A pending read inside `Loading` emits that boundary's fallback. Use streaming when the client must receive content after async work settles.

### Streaming rendering: `renderToStream`

- Emits the **synchronous shell first**, then fragments as pending `Loading` boundaries settle.
- The returned object can: pipe to a Node writable, pipe to a Web `WritableStream`, expose a `ReadableStream<Uint8Array>`, or be awaited for the fully settled HTML. Choose one output form per render.
  ```ts
  import { renderToStream } from "@solidjs/web";
  import { App } from "./App";

  export function handleRequest(): Response {
    const stream = renderToStream(() => <App />);
    return new Response(stream.readable, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  ```
  ```ts
  const html = await renderToStream(() => <App />);
  ```
- **Gotcha**: async reads **without** a surrounding `Loading` boundary block the shell until they settle. Inside a boundary, the shell can contain the fallback and a later stream fragment replaces it.

### Who owns the document

- When rendered output includes a closing `</head>`, the renderer inserts registered head content and assets into that document:
  ```tsx
  import { HydrationScript, renderToString } from "@solidjs/web";
  import { App } from "./App";

  const html = renderToString(() => (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <HydrationScript />
      </head>
      <body>
        <div id="app"><App /></div>
      </body>
    </html>
  ));
  ```
- When another host owns the document, render the fragment and use **`onHead`** to receive the head HTML. For `renderToString`, `onHead` runs synchronously before return; for `renderToStream`, before the shell is emitted:
  ```ts
  let head = "";
  const body = renderToString(() => <App />, {
    onHead(value) { head = value; },
  });
  const documentHtml = `<!doctype html><html><head>${head}</head><body><div id="app">${body}</div></body></html>`;
  ```

### Controlling hydration

- **`NoHydration`** renders children on the server without hydration keys or serialized signals; client hydration skips that subtree and leaves DOM untouched. After hydration, the client can render children fresh.
- **`Hydration`** re-enables hydration inside a `NoHydration` region; on the server it establishes a new hydration ID namespace. Pass the same value to the independent client root's `renderId`:
  ```tsx
  <NoHydration>
    <div id="account">
      <Hydration id="account"><Account /></Hydration>
    </div>
  </NoHydration>
  ```
  ```ts
  hydrate(() => <Account />, document.getElementById("account")!, { renderId: "account" });
  ```
- These divide hydration ownership rather than choose visible content — use only when server and client intentionally manage different parts of the document.

### Server and client boundaries

- **`isServer`** — a build-time constant (browser entry exports `false`, server entry exports `true`); bundlers can remove the unreachable side:
  ```ts
  import { isServer } from "@solidjs/web";
  if (!isServer) {
    window.addEventListener("online", reportOnline);
  }
  ```
- **`clientOnly`** — dynamically imported component that must never execute on the server. The server renders only its fallback and does not start the import; the client hydrates the fallback, waits for the module and hydration to settle, then swaps in the component:
  ```tsx
  import { clientOnly } from "@solidjs/web";

  const Map = clientOnly(() => import("./Map"));
  export function Location() {
    return <Map fallback={<div>Map unavailable during SSR</div>} />;
  }
  ```
  - By default `clientOnly` starts loading when its declaration runs; pass `{ lazy: true }` to defer the import until first render.

> **Note**: `httpStatus` / `httpHeader` (response status/header control during SSR) were not covered on this page in the fetched docs — check `/building-apps/middleware-and-api-routes` and `/building-apps/server-functions` for the idiomatic API.

---

## App Structure

- **Start mode**: `@solidjs/vite-plugin` owns the application entries, dev serving, and production build. Enable with `start: true` (or `start: {}`):
  ```ts
  import { defineConfig } from "vite";
  import solid from "@solidjs/vite-plugin";

  export default defineConfig({
    plugins: [solid({ start: true })],
  });
  ```
- A start-mode project needs **no `index.html` and no client mount file**. When no authored entry is selected, the plugin generates entries from `src/App.tsx` and (when present) `src/Document.tsx`.

### Rendering mode

- Client mode (default): prerenders the document shell without `App` to `dist/client/index.html`, then calls `render()` to mount into `document.body`. Without server functions, `dist/server` is removed and `dist/client` deploys to any static host. With server functions, pages stay static but endpoints use the retained server handler.
- `ssr: true` renders the app per request: streams the initial document and calls `hydrate()` in the browser. Production emits browser assets under `dist/client` and a request handler under `dist/server`.

### The app component

- `src/App.tsx` default-exports the root component used by generated entries. Start mode probes `.tsx`, `.jsx`, `.ts`, then `.js` for `src/App`, then lowercase `src/app` if no uppercase stem matches. Set `start.app` for another module.

### The document component

- `src/Document.tsx` default-exports the full HTML document; it receives the app as `props.children`, so the body must render those children. An SSR-ready document includes `<HydrationScript />`:
  ```tsx
  import type { ParentProps } from "solid-js";
  import { HydrationScript } from "@solidjs/web";

  export default function Document(props: ParentProps) {
    return (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          <title>Solid App</title>
          <HydrationScript />
        </head>
        <body>{props.children}</body>
      </html>
    );
  }
  ```
- Probes `src/Document.tsx` then `src/Document.jsx`; `start.document` takes precedence. If no document exists, a minimal built-in document is used. With generated entries the plugin injects the client entry script into the document head. **In client mode**, the app is omitted from the prerendered shell and `<HydrationScript />` output is removed (the browser mounts rather than hydrates).

### Generated and authored entries

- SSR mode: generated server entry renders `<Document><App /></Document>`; generated client entry hydrates the same tree.
- Probe order for conventional entries: `.tsx`, `.jsx`, `.ts`, `.js`, then `.mjs`. Explicit `start.entryServer` / `start.entryClient` take precedence.
- SSR mode requires **authored entries in pairs** (both sides must render the same document tree). The server entry exports `render()`, which may return a stream result, an HTML string, or a `Response`. The authored client entry owns hydration; an authored SSR document owns its client script element.
- Client mode always generates the server-side shell renderer; an authored client entry can stand alone and owns the browser mount. Authored server entries and `start.entryServer` are ignored in client mode.

### Mounting a router

- Start mode does **not** select a router — mount the router/provider under `App`.
- For routers needing a request-specific instance before SSR, use `start.setup` pointing to a **server-only** module:
  ```ts
  solid({
    start: { setup: "./src/setup.tsx" },
    ssr: true,
  });
  ```
  - The setup module default-exports a function receiving the current request event and the `App` component; the generated server entry invokes it after middleware dispatch and **before `renderToStream()` starts**. It may return a component (rendered in `App`'s place inside `Document`), nothing (keeps `<App />`), or a promise of either. The browser-side `App` must produce the corresponding router tree so hydration matches.
  - `start.setup` runs only for page renders by a generated server entry; ignored in client mode; combining with an authored server entry in SSR mode is an error.

---

## Styling and Assets

- Solid source files use Vite's CSS and asset imports; start mode keeps those forms for generated and authored entries.

### CSS

- Import a stylesheet for side effects to make rules global (e.g. `import "./App.css";`). Import location does not scope ordinary CSS selectors.

### CSS modules

- `*.module.css` imports generate a class-name map:
  ```tsx
  import styles from "./route.module.css";
  export default function Route() {
    return <p class={styles.message}>Scoped by CSS modules</p>;
  }
  ```

### CSS preprocessors

- Uses Vite's preprocessor pipeline with no extra start config — just install the preprocessor and import (e.g. `sass` + `import "./App.scss";`). Sass compiles during the build with no runtime in the browser. Use `*.module.scss` for scoped class names.

### Imported asset URLs

- Import an asset to get its resolved URL (`import logo from "../logo.svg";`). Append `?url` when code creates the consuming element:
  ```tsx
  import stylesheetUrl from "./theme.css?url";
  export default function ThemeLink() {
    return <link rel="stylesheet" href={stylesheetUrl} />;
  }
  ```
- Set `build.assetsInlineLimit: 0` when images must remain emitted files instead of being inlined.

### Public files

- Files under `public/` are addressed by root-relative names (e.g. `/favicon.ico`, `/users.json`), not module imports. Import an asset instead when code needs the URL produced for a module dependency.

### Start-mode output

- No `index.html`; import app CSS from `App`, an authored entry, or another reachable module.
- Dev: the page response inlines CSS reachable from the generated `App` and `Document` roots (style elements carry Vite dev identifiers; the start-mode patch removes the server-rendered copy when Vite's client-side style takes over). CSS HMR keeps working.
- Prod: entry CSS emits as built assets and the generated handler adds stylesheet links to the document head; imported asset URLs point at built output (Vite-generated filenames).

---

## Head and Metadata

- **Package**: `@solidjs/meta` (`npm i @solidjs/meta`). Solid Meta 1.x requires compatible Solid 2 RC builds of `solid-js` and `@solidjs/web` (or later). It is an ergonomic component layer over the ambient head registry Solid ships through `@solidjs/web`.

### Usage

- **No provider and no other setup** — render head components anywhere in the tree:
  ```tsx
  import { Title, Link, Meta } from "@solidjs/meta";

  function Home() {
    return (
      <div class="Home">
        <Title>Title of page</Title>
        <Link rel="canonical" href="https://solidjs.com/" />
        <Meta name="description" content="A description of this page" />
      </div>
    );
  }
  ```
- **Rules**:
  - **Later wins.** Tags deduplicate by identity (each component's reference page documents its identity rule); the last-registered tag for an identity is in the document.
  - **Disposal restores.** When the winning tag's component unmounts, the previous registration for that identity is restored — navigating away undoes head changes automatically.
  - **Reactive.** Attribute values and text children can be reactive expressions; updates apply in place without losing position in the override order.
- Every component accepts a `key` prop overriding the default identity — to make otherwise-distinct tags override each other, or to fork an identity that would collide:
  ```tsx
  {/* These override each other despite different attributes: */}
  <Meta key="social-image" name="twitter:image" content="/twitter.png" />
  <Meta key="social-image" property="og:image" content="/og.png" />
  ```

### Group related tags: `<Head>`

- `<Head>` groups tags into one **replacement set**. Tags with the same identity coexist inside a group; a later group replaces the earlier set as one unit, and unmounting restores it. Membership stays reactive as child tags mount/unmount.
  ```tsx
  import { Head, Meta } from "@solidjs/meta";

  function SocialDefaults() {
    return (
      <Head>
        <Meta property="og:image" content="/default-wide.png" />
        <Meta property="og:image" content="/default-square.png" />
      </Head>
    );
  }

  function ProductSocialTags(props: { image: string }) {
    return (
      <Head>
        <Meta property="og:image" content={props.image} />
        <Meta name="twitter:card" content="summary_large_image" />
      </Head>
    );
  }
  ```
- An inner `<Head>` starts an independent group. Render bare `Meta` components from child components when tags should join the surrounding group.

### Core head registry: `useHead`

- Call `useHead` from `@solidjs/web` for descriptor-level control (Solid Meta uses the same primitive internally):
  ```tsx
  import { useHead } from "@solidjs/web";

  function ProductDescription(props: { description: string }) {
    useHead({
      tag: "meta",
      props: {
        name: "description",
        content: () => props.description,
      },
    });
    return null;
  }
  ```
- Pass an array to register one replacement group; pass a function to make membership reactive. Prefer Solid Meta components for common metadata; `useHead`/`HeadTag` define the descriptor contract.

### Server rendering

- No wiring required — winning tags are spliced into `<head>` on the first flush (`<base>` and `<meta charset>` go right after `<head>` opens; resource links go early). Tags registered under a suspense boundary that completes later stream to the client as patches applied when the boundary reveals. If assembling the document yourself, use the `onHead` render option instead.
- On the client, hydration adopts server-rendered head tags **in place** — no removal/re-insertion flicker.
- **Gotcha**: a static `<title>` in the server shell acts as the fallback when no `<Title>` is mounted. Don't hardcode other tags Solid Meta should manage — the registry leaves foreign head tags alone, so a hardcoded `<meta name="description">` would coexist with a rendered one.

---

## Cross-Cutting Gotchas Summary (audit checklist)

- Component bodies run **untracked**; top-level reactive reads (incl. destructured props) are one-time snapshots → dev warning. Keep props intact or use `createMemo`.
- Memos and effect compute values are **not current until `flush()`**; signal/store writes batch to the microtask queue.
- `createEffect` split into compute (tracked) + apply (untracked); reads in the apply phase do not retrigger.
- Ref callbacks are untracked and ownerless — build directives as factories that create owned primitives (`onSettled`) during setup.
- `classList` is gone → use object/array forms of `class`.
- Stores: draft-first setters; returning a collection from a setter is **not** keyed reconciliation — use a projection (`createProjection` or function-form `createStore`) with a seed.
- Read every reactive input **before the first `await`** in async computations; reads after `await` create no dependency edge (dev builds error; production silently stays pending).
- `on` on `Loading` is a **value**, not an accessor.
- Async reads without a `Loading` boundary block the SSR shell until they settle.
- Import render/hydrate/stream/dynamic/isServer/clientOnly/HydrationScript/useHead from **`@solidjs/web`**; control flow (`For`/`Show`/`Switch`/`Match`/`Repeat`/`Loading`/`Errored`/`Reveal`) and reactivity from `solid-js`.
- New APIs to look for in audits: `createProjection`, `createOptimisticStore`, `Repeat`, `Reveal`, `Loading`, `Errored`, `isPending`, `latest`, `affects`, `refresh`, `resolve`, `onSettled`, `action`, `dynamic()`.
