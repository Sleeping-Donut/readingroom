import { Title } from "@solidjs/meta";
import { revalidate } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { action, createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";

import { addBook as createBook, getBooks, searchBooks } from "../../api/books";
import { BookCard } from "../../components/books/BookCard";
import { BookRow } from "../../components/books/BookRow";
import { ViewToggle, createViewPreference } from "../../components/ViewToggle";
import { paths } from "../../router";

export const route = defineFileRoute("/books", {
  preload: () => getBooks(),
});

const yearOf = (date?: string) => date?.match(/\d{4}/)?.[0];

const listSubtitle = (book: { author_name?: string; genres: string[]; publish_date?: string }) => {
  const base = book.author_name || book.genres.slice(0, 2).join(", ") || "Unknown author";
  const year = yearOf(book.publish_date);
  return year ? `${base} · ${year}` : base;
};

export default function Books() {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [showSearch, setShowSearch] = createSignal(false);
  const [addingId, setAddingId] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [view, setView] = createViewPreference("books");
  const [filterQuery, setFilterQuery] = createSignal("");

  const books = createMemo(() => getBooks());

  const searchResults = createMemo(async () => {
    const q = searchQuery().trim();
    if (!q) return null;
    return searchBooks(q);
  });

  const filteredBooks = createMemo(() => {
    const q = filterQuery().trim().toLowerCase();
    const all = books()?.books ?? [];
    if (!q) return all;
    return all.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.author_name ?? "").toLowerCase().includes(q) ||
        b.genres.some((g) => g.toLowerCase().includes(q)),
    );
  });

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
      revalidate(getBooks.key);
      setSearchQuery("");
      setShowSearch(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAddingId(null);
    }
  });

  return (
    <div>
      <Title>Books · ReadingRoom</Title>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">Books</h2>
        <div class="flex items-center gap-3">
          <ViewToggle view={view()} onChange={(v) => setView(v)} />
          <button
            onClick={() => setShowSearch(!showSearch())}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
          >
            {showSearch() ? "Cancel" : "Add Book"}
          </button>
        </div>
      </div>

      <Show when={showSearch()}>
        <div class="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <input
            type="text"
            placeholder="Search for a book by title..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            autofocus
          />

          <Errored
            fallback={(err, reset) => (
              <p class="text-sm text-red-400 mt-2">
                Search failed: {String(err())}{" "}
                <button
                  onClick={reset}
                  class="text-indigo-400 hover:text-indigo-300 underline ml-1"
                >
                  Retry
                </button>
              </p>
            )}
          >
            <Loading fallback={<p class="text-gray-500 text-sm">Searching...</p>}>
              <Show when={searchResults()} fallback={null}>
                {(r) => (
                  <Show
                    when={r().books.length > 0}
                    fallback={<p class="mt-4 text-gray-500 text-sm">No books found.</p>}
                  >
                    <div class="mt-4 space-y-2">
                      <For each={r().books}>
                        {(book) => (
                          <div class="flex items-center gap-4 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors">
                            <Show when={book.image_url}>
                              {(img) => (
                                <img
                                  src={img()}
                                  alt={book.title}
                                  class="w-10 h-14 object-cover rounded"
                                />
                              )}
                            </Show>
                            <div class="flex-1 min-w-0">
                              <p class="font-medium truncate">{book.title}</p>
                              <p class="text-xs text-gray-400 truncate">
                                {book.publish_date && `${book.publish_date}`}
                                {book.genres.length > 0 &&
                                  ` · ${book.genres.slice(0, 3).join(", ")}`}
                                {book.language && ` · ${book.language}`}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                void addBook({
                                  foreign_id: book.foreign_id,
                                  author_id: book.author_id,
                                  title: book.title,
                                })
                              }
                              disabled={addingId() === book.foreign_id}
                              class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
                            >
                              {addingId() === book.foreign_id ? "Adding..." : "Add"}
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                )}
              </Show>
            </Loading>
          </Errored>

          <Show when={actionError()}>
            <p class="text-sm text-red-400 mt-2">{actionError()}</p>
          </Show>
        </div>
      </Show>

      <Errored
        fallback={(err, reset) => (
          <p class="text-sm text-red-400 mt-2">
            Failed to load books: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 hover:text-indigo-300 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
          <Show
            when={(books()?.books ?? []).length > 0}
            fallback={
              <div class="text-center py-12 text-gray-500">
                <p class="text-lg">No books tracked yet.</p>
                <p class="text-sm mt-2">Click "Add Book" to search and start tracking.</p>
              </div>
            }
          >
            <div class="mb-4">
              <input
                type="text"
                placeholder="Filter tracked books by title or author..."
                value={filterQuery()}
                onInput={(e) => setFilterQuery(e.currentTarget.value)}
                class="w-full sm:w-72 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <Show
              when={filteredBooks().length > 0}
              fallback={
                <div class="text-center py-12 text-gray-500">
                  <p class="text-lg">No books match your filter.</p>
                </div>
              }
            >
              <Show
                when={view() === "grid"}
                fallback={
                  <div class="space-y-2">
                    <For each={filteredBooks()}>
                      {(book) => (
                        <BookRow
                          href={paths.books(book.id)}
                          cardLink
                          coverSrc={book.image_url}
                          title={book.title}
                          subtitle={listSubtitle(book)}
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
                        href={paths.books(book.id)}
                        cardLink
                        coverSrc={book.image_url}
                        title={book.title}
                        subtitle={
                          book.author_name || book.genres.slice(0, 2).join(", ") || "No author"
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
