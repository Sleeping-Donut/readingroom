import { useParams, revalidate } from "@solidjs/router";
import { action, createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";
import { paths } from "../../router";
import { getAuthor, getAuthorBooks } from "../../api/authors";
import { addBook as createBook, searchBooks } from "../../api/books";
import {
  downloadIndexerRelease,
  searchIndexersForAuthor,
  type ScoredRelease,
} from "../../api/search";
import { createViewPreference, ViewToggle } from "../../components/ViewToggle";
import type { Book, Release } from "../../types";

export const route = defineFileRoute("/authors/:id", {
  preload: ({ params }) => getAuthor(params.id),
});

export default function AuthorDetail() {
  const params = useParams(paths.authors);

  const author = createMemo(() => getAuthor(params.id));

  const metadataBooks = createMemo(async () => {
    const name = author().name;
    if (!name) return null;
    return searchBooks(name);
  });

  const trackedBooks = createMemo(() =>
    Number.isInteger(Number(params.id))
      ? getAuthorBooks(Number(params.id)).catch(() => ({ books: [] }))
      : { books: [] },
  );

  const filteredBooks = createMemo(() => {
    const q = filter().trim().toLowerCase();
    if (!q) return metadataBooks()?.books ?? [];
    return (metadataBooks()?.books ?? []).filter((b) => b.title.toLowerCase().includes(q));
  });

  const trackedByForeignId = createMemo(() => {
    const map: Record<string, Book> = {};
    for (const book of trackedBooks()?.books ?? []) {
      if (book.foreign_id) map[book.foreign_id] = book;
    }
    return map;
  });

  const bookHref = (book: Book) => {
    const tracked = trackedByForeignId()[book.foreign_id];
    return tracked ? paths.books(tracked.id) : paths.books(book.foreign_id);
  };

  const [indexerResults, setIndexerResults] = createSignal<{
    results: ScoredRelease[];
    total: number;
  } | null>(null);
  const [searching, setSearching] = createSignal(false);
  const [downloadingId, setDownloadingId] = createSignal<number | null>(null);
  const [addingId, setAddingId] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal("");
  const [view, setView] = createViewPreference("author-books");

  const addBook = action(async function* (book: {
    foreign_id: string;
    author_id: number;
    title: string;
  }) {
    setAddingId(book.foreign_id);
    setActionError(null);
    try {
      await createBook(book);
      yield;
      revalidate(getAuthorBooks.keyFor(Number(params.id)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAddingId(null);
    }
  });

  const indexerSearch = action(async function* () {
    setSearching(true);
    setActionError(null);
    try {
      const res = await searchIndexersForAuthor(params.id);
      yield;
      setIndexerResults(res);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSearching(false);
    }
  });

  const downloadRelease = action(async function* ({
    release,
    bookId,
    index,
  }: {
    release: Release;
    bookId: number | undefined;
    index: number;
  }) {
    setDownloadingId(index);
    setActionError(null);
    try {
      await downloadIndexerRelease(release, bookId);
      yield;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setDownloadingId(null);
    }
  });

  return (
    <div>
      <a
        href={paths.authors}
        class="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block"
      >
        &larr; Back to Authors
      </a>

      <Errored
        fallback={(err, reset) => (
          <p class="text-sm text-red-400 mt-2">
            Failed to load: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
          <Title>{author().name} · ReadingRoom</Title>
          <Show when={author()}>
            {(a) => (
              <div class="flex gap-8 mb-6">
                <Show when={a().image_url}>
                  {(img) => (
                    <img
                      src={img()}
                      alt={a().name}
                      class="w-48 h-72 object-cover rounded-lg shadow-lg"
                    />
                  )}
                </Show>
                <div class="flex-1">
                  <div class="flex items-start justify-between">
                    <div>
                      <h2 class="text-3xl font-bold mb-2">{a().name}</h2>
                      <div class="flex gap-4 text-sm text-gray-400 mb-4">
                        <Show when={a().birth_date}>
                          <span>Born: {a().birth_date}</span>
                        </Show>
                        <Show when={a().death_date}>
                          <span>Died: {a().death_date}</span>
                        </Show>
                        <span>ID: {a().id}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => void indexerSearch()}
                      disabled={searching()}
                      class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      {searching() ? "Searching..." : "Search Indexers"}
                    </button>
                  </div>

                  <Show when={a().biography}>
                    <p class="text-gray-300 leading-relaxed">{a().biography}</p>
                  </Show>
                  <Show when={a().genres.length > 0}>
                    <div class="mt-4 flex gap-2 flex-wrap">
                      <For each={a().genres}>
                        {(g) => (
                          <span class="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300">
                            {g}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <Show when={a().aliases.length > 0}>
                    <p class="mt-4 text-sm text-gray-400">
                      Also known as: {a().aliases.join(", ")}
                    </p>
                  </Show>
                </div>
              </div>
            )}
          </Show>
        </Loading>
      </Errored>

      <Show when={actionError()}>
        <p class="text-sm text-red-400 mt-2 mb-4">{actionError()}</p>
      </Show>

      <Show when={indexerResults()}>
        {(r) => (
          <div class="mb-8">
            <h3 class="text-xl font-bold mb-4">Search Results ({r().total} releases found)</h3>
            <div class="space-y-2">
              <For each={r().results}>
                {(result, index) => (
                  <div class="flex items-center gap-4 p-3 bg-gray-900 rounded-lg border border-gray-800">
                    <div class="flex-1 min-w-0">
                      <p class="font-medium truncate">{result.release.title}</p>
                      <p class="text-xs text-gray-400">
                        {result.release.indexer}
                        {result.release.seeders != null && ` · ${result.release.seeders} seeders`}
                        {result.release.size > 0 &&
                          ` · ${(result.release.size / 1_000_000).toFixed(0)} MB`}
                      </p>
                      <p class="text-xs text-gray-500">
                        Score: {result.score.toFixed(0)}
                        {result.reasons.length > 0 && ` · ${result.reasons.slice(0, 2).join(", ")}`}
                      </p>
                    </div>
                    <span class="text-xs text-indigo-400 mr-2">{result.release.download_type}</span>
                    <button
                      onClick={() =>
                        void downloadRelease({
                          release: result.release,
                          bookId: result.matched_book_id ?? author()?.id,
                          index: index(),
                        })
                      }
                      disabled={downloadingId() === index()}
                      class="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
                    >
                      {downloadingId() === index() ? "..." : "Download"}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>

      <Errored
        fallback={(err, reset) => (
          <p class="text-sm text-red-400 mt-2">
            Failed to load: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
          <Show when={metadataBooks()}>
            {(mb) => (
              <Show when={mb().books.length > 0}>
                <div class="flex items-center justify-between gap-4 mb-4">
                  <h3 class="text-xl font-bold">Books by {author()?.name} (from metadata)</h3>
                  <div class="flex items-center gap-3">
                    <input
                      type="text"
                      value={filter()}
                      onInput={(e) => setFilter(e.currentTarget.value)}
                      placeholder="Filter by title..."
                      class="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                    <ViewToggle view={view()} onChange={(v) => setView(v)} />
                  </div>
                </div>
                <Show
                  when={filteredBooks().length > 0}
                  fallback={<p class="text-sm text-gray-500">No books match your filter.</p>}
                >
                  <Show
                    when={view() === "grid"}
                    fallback={
                      <div class="space-y-2">
                        <For each={filteredBooks()}>
                          {(book) => {
                            const tracked = trackedByForeignId()[book.foreign_id];
                            return (
                              <div class="flex items-center gap-4 p-3 bg-gray-900 rounded-lg border border-gray-800">
                                <a href={bookHref(book)} class="shrink-0">
                                  <Show
                                    when={book.image_url}
                                    fallback={
                                      <div class="w-10 h-14 rounded bg-gray-800 flex items-center justify-center shrink-0">
                                        <span class="text-xl text-gray-600">📖</span>
                                      </div>
                                    }
                                  >
                                    {(img) => (
                                      <img
                                        src={img()}
                                        alt={book.title}
                                        class="w-10 h-14 object-cover rounded shrink-0"
                                      />
                                    )}
                                  </Show>
                                </a>
                                <div class="flex-1 min-w-0">
                                  <a href={bookHref(book)} class="block">
                                    <p class="font-medium truncate hover:text-indigo-300">
                                      {book.title}
                                    </p>
                                  </a>
                                  <p class="text-xs text-gray-400 mt-0.5 truncate">
                                    {book.publish_date && `${book.publish_date}`}
                                  </p>
                                </div>
                                <Show
                                  when={tracked}
                                  fallback={
                                    <button
                                      onClick={() =>
                                        void addBook({
                                          foreign_id: book.foreign_id,
                                          author_id: book.author_id,
                                          title: book.title,
                                        })
                                      }
                                      disabled={addingId() === book.foreign_id}
                                      class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded text-xs font-medium transition-colors shrink-0"
                                    >
                                      {addingId() === book.foreign_id ? "Adding..." : "Add Book"}
                                    </button>
                                  }
                                >
                                  <span class="px-3 py-1.5 bg-green-900/40 text-green-400 border border-green-800 rounded text-xs font-medium shrink-0">
                                    ✓ Tracked
                                  </span>
                                </Show>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    }
                  >
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      <For each={filteredBooks()}>
                        {(book) => {
                          const tracked = trackedByForeignId()[book.foreign_id];
                          return (
                            <div class="block p-3 bg-gray-900 rounded-lg border border-gray-800 transition-colors">
                              <a href={bookHref(book)} class="block">
                                <Show
                                  when={book.image_url}
                                  fallback={
                                    <div class="w-full aspect-[2/3] rounded bg-gray-800 flex items-center justify-center mb-3">
                                      <span class="text-3xl text-gray-600">📖</span>
                                    </div>
                                  }
                                >
                                  {(img) => (
                                    <img
                                      src={img()}
                                      alt={book.title}
                                      class="w-full aspect-[2/3] object-cover rounded mb-3"
                                    />
                                  )}
                                </Show>
                              </a>
                              <a href={bookHref(book)} class="block">
                                <p class="font-medium truncate">{book.title}</p>
                              </a>
                              <p class="text-xs text-gray-400 mt-0.5 truncate">
                                {book.publish_date && `${book.publish_date}`}
                              </p>
                              <Show
                                when={tracked}
                                fallback={
                                  <button
                                    onClick={() =>
                                      void addBook({
                                        foreign_id: book.foreign_id,
                                        author_id: book.author_id,
                                        title: book.title,
                                      })
                                    }
                                    disabled={addingId() === book.foreign_id}
                                    class="mt-2 w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
                                  >
                                    {addingId() === book.foreign_id ? "Adding..." : "Add Book"}
                                  </button>
                                }
                              >
                                <span class="mt-2 w-full flex items-center justify-center px-3 py-1.5 bg-green-900/40 text-green-400 border border-green-800 rounded text-xs font-medium">
                                  ✓ Tracked
                                </span>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </Show>
              </Show>
            )}
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}
