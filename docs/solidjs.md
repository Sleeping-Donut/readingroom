# SolidJS Cheatsheet

## Architecture & Reusable Chunks

### Components

Group related JSX structure, local reactivity, and visual presentation into pure, reusable functions to keep your views modular and maintainable.

### Custom Primitives & Signals

Move stateful logic, side effects, and async transitions into self-contained custom primitives (functions like `createPostsStream` or `useLikeAction`) to decouple business logic from the UI and expose a minimal, targeted API surface.

```ts
// Encapsulates internal store & action mechanics
function createPostLikes(postId: string) {
  const [likes, setLikes] = createSignal(0);

  const toggleLike = action(function* () {
    setLikes(n => n + 1);
    yield api.likePost(postId);
  });

  // Expose reactive getters & explicit actions — hide raw setters/internal state
  return [likes, { toggleLike }] as const;
}

// Consumer UI sees only what it needs
function LikeButton(props: { id: string }) {
  const [likes, { toggleLike }] = createPostLikes(props.id);
  return <button onClick={() => toggleLike()}>{likes()} Likes</button>;
}
```

### Codebase Architecture & File Conventions

Solid 2.0 leans on feature-driven co-location: group code by what it does for the user rather than its technical file type.

#### Standard Directory Structure

```
src/
├── api/             # Server-only RPCs ("use server"), DB clients, & API primitives
├── assets/          # Static media (images, fonts, global icons)
├── components/      # Cross-cutting / generic UI elements
│   └── ui/          # Unstyled/primitive design-system primitives (Button, Input, Modal)
├── features/        # Feature modules (domain-driven co-location)
│   └── posts/
│       ├── api.ts   # Feature-specific "use server" RPC methods
│       ├── model.ts # Domain types & custom state primitives (stores/signals)
│       ├── PostCard.tsx
│       └── PostCard.module.css
├── routes/          # Page entry points & file-based routing definitions
└── styles/          # Global tokens, reset CSS, utility classes
```

#### What to Co-locate vs. What to Centralize

##### Co-locate inside `features/[feature-name]/`

Keep files that change together physically close to each other.

- **Component-specific CSS Modules** (`*.module.css`): Co-locate directly next to the .tsx file that imports them.
- **Feature Primitives & Stores**: If a store or primitive (e.g., `createPostsStream`) is only used by `posts/`, put it in `features/posts/model.ts`.
- **Feature Server RPCs**: Put domain server calls in `features/posts/api.ts` with top-level `"use server"`.

##### Centralize in global root directories

Extract code to shared top-level folders only when consumed by 2 or more distinct features.

- `src/components/ui/`: Pure presentation primitives (Buttons, Dialogs, Tooltips) with no domain logic.
- `src/api/`: Shared server setup (DB client instances, generic auth/session helpers, base RPC clients).
- `src/styles/`: Global design tokens, CSS variables, resets, and utility definitions.

##### Styling Conventions

| Style Approach | Location / File Pattern | Recommended Usage
| :--- | :--- | :--- |
| **CSS Modules** | Co-located [Component].module.css | Component-scoped styles; prevents global class collision |
| **Global / Tokens** | `src/styles/globals.css` | CSS custom properties (--color-primary), resets, typography |
| **Tailwind / Utility** | Configured globally, inline classes | Rapid component styling; pair with `components/ui/` |

## Actions & Generator Mechanics

Solid 2.0 actions wrap generator functions. The generator runner automatically awaits any yielded Promise and returns its unwrapped value back into the `yield` expression.

### Direct Sync Generator (`function*`)

This is the type of generator you'll use most often and is recommended for most situations.
Pass the Promise directly to `yield`. The runner unwraps the Promise and assigns the resolved data to your variable.

```ts
const likePost = action(function* (postId: string) {
  setPosts(s => { s.find(p => p.id === postId)!.likes++; });

  // `yield` awaits `api.likePost` and assigns the resolved Post object
  const updatedPost: Post = yield api.likePost(postId);

  setSrcPosts(s => { Object.assign(s.find(p => p.id === postId)!, updatedPost); });
});
```

### Async Generator (`async function*`) + Blank `yield`

If your action uses `await` internally, use a blank `yield`; afterward to step through Solid's transaction boundary before mutating base stores.

```ts
const likePost = action(async function* (postId: string) {
  setPosts(s => { s.find(p => p.id === postId)!.likes++; });

  // Native JS await handles resolution
  const updatedPost = await api.likePost(postId);

  // Blank yield pauses execution & aligns the reactive transition step
  yield;

  setSrcPosts(s => { Object.assign(s.find(p => p.id === postId)!, updatedPost); });
});
```

## Pending States & Optimistic UI

Hold ephemeral state or pending state in optimistic values. Any set that occurs to optimistic state inside an action will be reverted at the end of the action.

### Basic Pending Flags

Optimistic booleans let you immediately update part of the UI, like disabling a button or showing a loading spinner, while an asynchronous action is in flight. The state automatically reverts to the base value once the action has completed or throws.

```ts
const [isSubmitting, setIsSubmitting] = createOptimistic(false);

const handleSubmit = action(function* (formData: FormData) {
  setIsSubmitting(true); // Optimistically set to true
  yield submitForm(formData);
  // End of action: isSubmitting automatically reverts to `false`
});
```

### Pending States: `useSubmission` vs `createOptimistic`

Solid 2.0 provides two primary ways to track and display pending states during async operations.

| Feature | `useSubmission(action)` | `createOptimistic(initialValue)` |
| :--- | :--- | :--- |
| **Primary Scope** | Form submissions & action tracking | Local signals, custom controls, fine-grained UI |
| **State Scope** | Bound to a specific `action` function | Bound to a specific reactive signal or piece of state |
| **Payload Access** | Accesses in-flight form data (`sub.input`) | Free-form optimistic state values |
| **Manual Reset** | Automatic (managed by Solid router/action lifecycle) | Automatic (reverts when generator action yields/completes) |

#### When to use `useSubmission`

Use `useSubmission` for standard HTML forms submitted via actions.

```ts
const submitFormAction = action(function* (formData: FormData) {
  yield api.saveUser(formData);
});

function UserProfile() {
  const submission = useSubmission(submitFormAction);

  return (
    <form action={submitFormAction} method="post">
      <input name="username" type="text" />
      <button type="submit" disabled={submission.pending}>
        {submission.pending ? "Saving..." : "Save"}
      </button>

      <Show when={submission.pending}>
        <p>Updating username to {submission.input[0].get("username") as string}...</p>
      </Show>
    </form>
  );
}
```

#### When to use `createOptimistic`

Use `createOptimistic` for fine-grained interactive controls (toggle switches, like buttons, or inline updates).

```ts
const [isLiked, setIsLiked] = createOptimistic(false);

const toggleLike = action(function* (postId: string) {
  setIsLiked(prev => !prev); // Immediately toggle UI state
  yield api.likePost(postId); // Automatically reverts on error/completion
});
```

### Optimistic Stores

Optimistic stores let you update local UI state immediately while asynchronous actions run in the background.

#### Basic (Derived from Async Data Source)

```ts
const [posts, setPosts] = createOptimisticStore<Post[]>(() => fetchPosts());

const likePost = action(function* (postId: string) {
  setPosts(ps => {
    const post = ps.find(p => p.id === postId);
    if (post) post.likes++;
  });
  
  yield api.likePost(postId);
  refresh(posts);
});
```

#### Complex (Decoupled Source & Optimistic Stores)

When you want to update client stores locally without triggering a full server re-fetch, split your source-of-truth store and your optimistic store.

```ts
// Local source of truth
const [srcPosts, setSrcPosts] = createStore<Post[]>(() => fetchPosts());
// Optimistic store tracking source
const [posts, setPosts] = createOptimisticStore(() => srcPosts);

const likePost = action(function* (postId: string) {
  const applyLike = (ps: Post[]) => {
    const post = ps.find(p => p.id === postId);
    if (post) post.likes++;
  };

  // 1. Immediately apply update to optimistic store for instant UI response
  setPosts(applyLike);

  yield api.likePost(postId);

  // 2. Persist update into base store on success
  setSrcPosts(applyLike);
});
```

## Live Data & Event Feeds

When your base data stream updates automatically via WebSockets, Server-Sent Events (SSE), or live subscriptions, incoming network events can collide with optimistic local states.

To prevent flickering or state clobbering, follow two core rules:

- **Source Store Drives Live Events**: Route live subscription events directly into your underlying base store, not your derived stores.
- **Re-enter Action Context Before Base Updates**: In generator actions, place a `yield` point after your API call completes but before manually updating the base store.

```ts
type Post = { id: string; title: string; likes: number };

// 1. Base store streams initial fetch and applies live WebSocket events
const [srcPosts, setSrcPosts] = createStore<Post[]>(async function* () {
  let list = await api.getPosts();
  yield list; // Initial load

  for await (const event of api.subscribeToPosts()) {
    if (event.type === 'update') {
      list = list.map(p => (p.id === event.data.id ? event.data : p));
    } else if (event.type === 'delete') {
      list = list.filter(p => p.id !== event.data.id);
    }
    yield list;
  }
}, []);

// 2. Optimistic store tracks the live base store
const [posts, setPosts] = createOptimisticStore(() => srcPosts);

// 3. Action handles local optimism without clobbering incoming stream events
const likePost = action(function* (postId: string) {
  setPosts(s => {
    const post = s.find(p => p.id === postId);
    if (post) post.likes++;
  });

  const updatedPost: Post = yield api.likePost(postId);

  setSrcPosts(s => {
    const post = s.find(p => p.id === postId);
    if (post) Object.assign(post, updatedPost);
  });
});
```

## Error Handling & Recovery

### Error Boundaries & Optimistic Actions

When an error occurs during an optimistic action, Solid 2.0 handles it depending on whether you explicitly catch the error inside the action generator or let it bubble up to an `<ErrorBoundary>`.

#### Let Errors Bubble (Standard Error Boundary)

If you do not use a `try` / `catch` block inside your action generator, any thrown error or rejected Promise will re-throw. Solid's transition runner will automatically revert any optimistic changes and pass the error to the nearest `<ErrorBoundary>`.

```ts
const deletePost = action(function* (postId: string) {
  setPosts(s => s.filter(p => p.id !== postId));
  yield api.deletePost(postId);
});

function PostList() {
  return (
    <ErrorBoundary fallback={(err) => <p class="error">Failed to delete: {err.message}</p>}>
      <For each={posts()}>{post => <PostRow onDelete={deletePost} post={post} />}</For>
    </ErrorBoundary>
  );
}
```

#### Handle Errors Inline (Non-Disruptive UI Recovery)

If you want the rest of the application to remain intact without triggering an Error Boundary, wrap the yielded operation in a `try` / `catch`.

```ts
const createPost = action(function* (title: string) {
  const tmpId = crypto.randomUUID();
  setPosts(s => s.push({ id: tmpId, title, pending: true }));

  try {
    const savedPost: Post = yield api.createPost({ title });
    setSrcPosts(s => s.push(savedPost));
  } catch (err) {
    setErroredPosts(tmpId, {
      id: tmpId,
      title,
      error: "Network error. Try again.",
      retry: () => createPost(title)
    });
  }
});
```

#### Stores & Optimistic Failure Affordances

By pairing an optimistic store with a secondary "error map" store, you can keep failed operations visible in the UI with inline affordances like retry or dismiss buttons.

```ts
type Post = { id: string; title: string; pending?: boolean };
type FailedPost = Post & { error: string; retry: () => Promise<void> };

// Base stores
const [srcPosts, setSrcPosts] = createStore<Post[]>(() => fetchPosts(), []);
const [erroredPosts, setErroredPosts] = createStore<Record<string, FailedPost>>({});

// Combine base posts with active errors into a single optimistic store
const [posts, setPosts] = createOptimisticStore<Post[]>(() => [
  ...srcPosts,
  ...Object.values(erroredPosts)
]);

const createPost = action(function* (title: string) {
  const tmpId = crypto.randomUUID();
  const draftPost: Post = { id: tmpId, title, pending: true };

  setPosts(s => s.push(draftPost));

  try {
    const savedPost: Post = yield api.createPost({ title });
    setSrcPosts(s => s.push(savedPost));
    setErroredPosts(tmpId, undefined!); 
  } catch (err) {
    setErroredPosts(tmpId, {
      ...draftPost,
      pending: false,
      error: 'Failed to create post',
      retry: () => createPost(title)
    });
  }
});
```

## Server Actions & Data Fetching Patterns

Solid 2.0 separates **server functions** (RPC execution boundaries on the server) from **client actions** (reactive UI transition runners on the client).

### Defining Server RPCs vs. Client Actions

A file with a top-level `"use server"` directive exports pure RPC endpoints. Client components import these server functions and wrap them in `action()` to coordinate pending states and optimistic UI.

#### Top-Level `"use server"` Module

This pattern is recommended as it enusres all contents are only bundled for the server.

```ts
// api/posts.ts
"use server";

import { db } from "~/lib/db";

// 1. Pure Server RPC — runs strictly on the server
export async function createPostServer(formData: FormData) {
  const title = formData.get("title") as string;
  if (!title) throw new Error("Title is required");

  return await db.posts.create({ data: { title } });
}
```

```ts
// features/posts/CreatePost.tsx
import { action } from "solid-js";
import { createPostServer } from "~/api/posts";

// 2. Client Action — handles client transition and optimistic state
export const createPost = action(function* (formData: FormData) {
  // `yield` awaits the server RPC, unwraps the resolved Post, and resumes transition
  const post: Post = yield createPostServer(formData);
  return post;
});
```

#### Inline Server Action (`"use server"`)

If you prefer co-locating server logic directly inside an action definition, place `"use server"` inside the generator callback scope.

```ts
import { action } from "solid-js";

export const createPost = action(function* (formData: FormData) {
  "use server"; // Marks the body execution boundary for the server
  
  const title = formData.get("title") as string;
  const post = yield db.posts.create({ data: { title } });
  return post;
});
```

#### Data Fetching: Resources vs. Streamed Loaders Single-Fetch Loader (`createResource`)

Pair `createResource` with server RPCs for static or reactive data queries.

```ts
import { createResource } from "solid-js";
import { fetchPostServer } from "~/api/posts"; // "use server" RPC

function PostView(props: { postId: string }) {
  // Automatically re-executes whenever props.postId changes
  const [post] = createResource(() => props.postId, fetchPostServer);

  return (
    <Show when={!post.loading} fallback={<p>Loading post...</p>}>
      <article>
        <h1>{post()?.title}</h1>
      </article>
    </Show>
  );
}
```

#### Streamed Loader (`async function*`)

Use an exported server generator function to stream progressive or chunked responses over HTTP.

```ts
// api/feed.ts
"use server";

export async function* streamFeedServer() {
  const initialBatch = await db.posts.findMany({ take: 10 });
  yield initialBatch; // Flushes first batch to client immediately

  const analytics = await db.analytics.getSummary();
  yield { posts: initialBatch, analytics }; // Streams secondary payload as it resolves
}
```

| Boundary | Syntax / Location | Primary Role |
| :--- | :--- | :--- |
| **Server RPC** | Top-level `"use server"` | DB access, authentication, secrets, server-side validation |
| **Client Action** | `action(function* () { ... }`) | Optimistic state, useSubmission binding, transition boundary |
| **Inline Server Action** | `use server"` inside `action()` | Direct co-located server mutation without a separate API file |
| **Streamed Loader** | `"use server"` + `async function*` | Continuous or chunked response streaming to client stores/resources |

