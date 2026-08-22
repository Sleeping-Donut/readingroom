import { Title } from "@solidjs/meta";
import { revalidate, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  Errored,
  For,
  Loading,
  Show,
} from "solid-js";

import type { Author, Book, Release } from "../../types";

import { getAuthor, getAuthorBooks } from "../../api/authors";
import { searchBooks, bookId } from "../../api/books";
import {
  downloadIndexerRelease,
  searchIndexersForAuthor,
  type ScoredRelease,
} from "../../api/search";
import { BookCard } from "../../components/books/BookCard";
import { BookRow } from "../../components/books/BookRow";
import { createViewPreference, ViewToggle } from "../../components/ViewToggle";
import { createBooks } from "../../resources/books";
import { paths } from "../../router";

export const route = defineFileRoute("/authors/:id", {
  preload: ({ params }) => getAuthor(params.id),
});

function BookAction(props: {
  tracked: Book | undefined;
  adding: boolean;
  onAdd: () => void;
  block?: boolean;
}) {
  return (
    <Show
      when={props.tracked}
      fallback={
        <button
          onClick={props.onAdd}
          disabled={props.adding}
          class={[
            "px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded text-xs font-medium transition-colors",
            props.block ? "mt-2 w-full" : "shrink-0",
          ]}
        >
          {props.adding ? "Adding..." : "Add Book"}
        </button>
      }
    >
      <span
        class={[
          "px-3 py-1.5 bg-green-900/40 text-green-400 border border-green-800 rounded text-xs font-medium",
          props.block ? "mt-2 w-full flex items-center justify-center" : "shrink-0",
        ]}
      >
        ✓ Tracked
      </span>
    </Show>
  );
}

function ReleaseRow(props: {
  result: ScoredRelease;
  downloading: boolean;
  onDownload: () => void;
}) {
  return (
    <div class="flex items-center gap-4 p-3 bg-gray-900 rounded-lg border border-gray-800">
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">{props.result.release.title}</p>
        <p class="text-xs text-gray-400">
          {props.result.release.indexer}
          {props.result.release.seeders != null && ` · ${props.result.release.seeders} seeders`}
          {props.result.release.size > 0 &&
            ` · ${(props.result.release.size / 1_000_000).toFixed(0)} MB`}
        </p>
        <p class="text-xs text-gray-500">
          Score: {props.result.score.toFixed(0)}
          {props.result.reasons.length > 0 && ` · ${props.result.reasons.slice(0, 2).join(", ")}`}
        </p>
      </div>
      <span class="text-xs text-indigo-400 mr-2">{props.result.release.download_type}</span>
      <button
        onClick={props.onDownload}
        disabled={props.downloading}
        class="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
      >
        {props.downloading ? "..." : "Download"}
      </button>
    </div>
  );
}

function AuthorBio(props: { author: Author; searching: boolean; onSearch: () => void }) {
  return (
    <div class="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-6">
      <Show when={props.author.image_url}>
        {(img) => (
          <img
            src={img()}
            alt={props.author.name}
            class="w-48 h-72 object-cover rounded-lg shadow-lg"
          />
        )}
      </Show>
      <div class="flex-1">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-3xl font-bold mb-2">{props.author.name}</h2>
            <div class="flex gap-4 text-sm text-gray-400 mb-4">
              <Show when={props.author.birth_date}>
                <span>Born: {props.author.birth_date}</span>
              </Show>
              <Show when={props.author.death_date}>
                <span>Died: {props.author.death_date}</span>
              </Show>
              <span>ID: {props.author.id}</span>
            </div>
          </div>
          <button
            onClick={props.onSearch}
            disabled={props.searching}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            {props.searching ? "Searching..." : "Search Indexers"}
          </button>
        </div>

        <Show when={props.author.biography}>
          <p class="text-gray-300 leading-relaxed">{props.author.biography}</p>
        </Show>
        <Show when={props.author.genres.length > 0}>
          <div class="mt-4 flex gap-2 flex-wrap">
            <For each={props.author.genres}>
              {(g) => <span class="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300">{g}</span>}
            </For>
          </div>
        </Show>
        <Show when={props.author.aliases.length > 0}>
          <p class="mt-4 text-sm text-gray-400">Also known as: {props.author.aliases.join(", ")}</p>
        </Show>
      </div>
    </div>
  );
}

export default function AuthorDetail(props: RouteProps<typeof route>) {
  const author = createMemo(() => getAuthor(props.params.id));

  // Empty result (not null) until the author's name resolves, so consumers
  // read one non-nullable shape.
  const EMPTY_SEARCH = { books: [] as Book[], total: 0 };
  const metadataBooks = createMemo(async () => {
    const name = author().name;
    if (!name) return EMPTY_SEARCH;
    return searchBooks(name);
  });

  const trackedBooks = createMemo(() => getAuthorBooks(props.params.id));

  const dedupedBooks = createMemo(() => {
    const seen = new Set<string>();
    const out: Book[] = [];
    for (const b of metadataBooks().books) {
      const key = b.foreign_id || b.title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(b);
    }
    return out;
  });

  const filteredBooks = createMemo(() => {
    const q = filter().trim().toLowerCase();
    if (!q) return dedupedBooks();
    return dedupedBooks().filter((b) => b.title.toLowerCase().includes(q));
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
    return paths.books(bookId(tracked ?? book));
  };

  const [indexerResults, setIndexerResults] = createSignal<{
    results: ScoredRelease[];
    total: number;
  } | null>(null);
  // Optimistic: reverts automatically when its action settles.
  const [searching, setSearching] = createOptimistic(false);
  // Keyed busy flags for per-row buttons; no store row to hang pending on.
  const [downloadingId, setDownloadingId] = createSignal<number | null>(null);
  const [addingId, setAddingId] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal("");
  const [view, setView] = createViewPreference("author-books");

  const [, { addBook: addBookToLibrary }] = createBooks();

  const addBook = action(async function* (book: {
    foreign_id: string;
    author_id: number;
    title: string;
    author_name?: string;
  }) {
    setAddingId(book.foreign_id);
    setActionError(null);
    try {
      yield addBookToLibrary(book);
      yield revalidate(getAuthorBooks.keyFor(props.params.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  const indexerSearch = action(async function* () {
    setSearching(true);
    setActionError(null);
    try {
      const res = await searchIndexersForAuthor(props.params.id);
      yield;
      setIndexerResults(res);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
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
          <AuthorBio
            author={author()}
            searching={searching()}
            onSearch={() => void indexerSearch()}
          />
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
                  <ReleaseRow
                    result={result}
                    downloading={downloadingId() === index()}
                    onDownload={() =>
                      void downloadRelease({
                        release: result.release,
                        bookId: result.matched_book_id ?? author()?.id,
                        index: index(),
                      })
                    }
                  />
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
          <Show when={metadataBooks().books.length > 0}>
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 class="text-xl font-bold">Books by {author()?.name} (from metadata)</h3>
              <div class="flex flex-wrap items-center gap-3">
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
                      {(book) => (
                        <BookRow
                          href={bookHref(book)}
                          coverSrc={book.image_url}
                          title={book.title}
                          subtitle={book.publish_date ?? ""}
                          coverEmojiClass="text-xl"
                          footer={
                            <BookAction
                              tracked={trackedByForeignId()[book.foreign_id]}
                              adding={addingId() === book.foreign_id}
                              onAdd={() =>
                                void addBook({
                                  foreign_id: book.foreign_id,
                                  author_id: book.author_id,
                                  title: book.title,
                                  author_name: book.author_name,
                                })
                              }
                            />
                          }
                        />
                      )}
                    </For>
                  </div>
                }
              >
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <For each={filteredBooks()}>
                    {(book) => (
                      <BookCard
                        href={bookHref(book)}
                        coverSrc={book.image_url}
                        title={book.title}
                        subtitle={book.publish_date ?? ""}
                        footer={
                          <BookAction
                            tracked={trackedByForeignId()[book.foreign_id]}
                            adding={addingId() === book.foreign_id}
                            onAdd={() =>
                              void addBook({
                                foreign_id: book.foreign_id,
                                author_id: book.author_id,
                                title: book.title,
                              })
                            }
                            block
                          />
                        }
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}
