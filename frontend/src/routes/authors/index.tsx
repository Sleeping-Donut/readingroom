import { action, createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { revalidate } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { addAuthor as createAuthor, getAuthors, searchAuthors } from "../../api/authors";
import { paths } from "../../router";
import { createViewPreference, ViewToggle } from "../../components/ViewToggle";
import { AuthorCard } from "../../components/authors/AuthorCard";
import { AuthorRow } from "../../components/authors/AuthorRow";
import type { Author } from "../../types";

export const route = defineFileRoute("/authors", {
  preload: () => getAuthors(),
});

const matchesFilter = (author: Author, q: string) =>
  author.name.toLowerCase().includes(q) ||
  author.aliases.some((alias) => alias.toLowerCase().includes(q)) ||
  author.genres.some((genre) => genre.toLowerCase().includes(q));

const rowSubtitle = (author: Author) => {
  const dates = [author.birth_date, author.death_date].filter(Boolean).join(" – ");
  const genres = author.genres.length > 0 ? ` · ${author.genres.slice(0, 2).join(", ")}` : "";
  return `${dates}${genres}`;
};

export default function Authors() {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [showSearch, setShowSearch] = createSignal(false);
  const [addingId, setAddingId] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [filterQuery, setFilterQuery] = createSignal("");
  const [view, setView] = createViewPreference("authors");

  const authors = createMemo(() => getAuthors());

  const searchResults = createMemo(async () => {
    const q = searchQuery();
    if (q.length === 0) return null;
    return searchAuthors(q);
  });

  const filtered = createMemo(() => {
    const q = filterQuery().trim().toLowerCase();
    const all = authors()?.authors ?? [];
    if (!q) return all;
    return all.filter((author) => matchesFilter(author, q));
  });

  const addAuthor = action(async function* (author: { foreign_id: string; name: string }) {
    setAddingId(author.foreign_id);
    setActionError(null);
    try {
      await createAuthor(author);
      yield;
      revalidate(getAuthors.key);
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
      <Title>Authors · ReadingRoom</Title>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">Authors</h2>
        <div class="flex items-center gap-3">
          <ViewToggle view={view()} onChange={(v) => setView(v)} />
          <button
            onClick={() => setShowSearch(!showSearch())}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
          >
            {showSearch() ? "Cancel" : "Add Author"}
          </button>
        </div>
      </div>

      <Show when={showSearch()}>
        <div class="mb-6 p-4 bg-gray-900 rounded-lg border border-gray-800">
          <input
            type="text"
            placeholder="Search for an author by name..."
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
            <Loading fallback={<p class="text-gray-500">Loading...</p>}>
              <Show when={searchResults()} fallback={null}>
                {(r) => (
                  <Show
                    when={r().authors.length > 0}
                    fallback={<p class="mt-4 text-gray-500 text-sm">No authors found.</p>}
                  >
                    <div class="mt-4 space-y-2">
                      <For each={r().authors}>
                        {(author) => (
                          <div class="flex items-center gap-4 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors">
                            <Show when={author.image_url}>
                              {(img) => (
                                <img
                                  src={img()}
                                  alt={author.name}
                                  class="w-10 h-14 object-cover rounded"
                                />
                              )}
                            </Show>
                            <div class="flex-1 min-w-0">
                              <p class="font-medium truncate">{author.name}</p>
                              <p class="text-xs text-gray-400 truncate">
                                {author.birth_date && `${author.birth_date}`}
                                {author.birth_date && author.death_date && " – "}
                                {author.death_date && `${author.death_date}`}
                                {author.genres.length > 0 &&
                                  ` · ${author.genres.slice(0, 3).join(", ")}`}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                void addAuthor({
                                  foreign_id: author.foreign_id,
                                  name: author.name,
                                })
                              }
                              disabled={addingId() === author.foreign_id}
                              class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
                            >
                              {addingId() === author.foreign_id ? "Adding..." : "Add"}
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
            Failed to load authors: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 hover:text-indigo-300 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
          <Show
            when={(authors()?.authors ?? []).length > 0}
            fallback={
              <div class="text-center py-12 text-gray-500">
                <p class="text-lg">No authors tracked yet.</p>
                <p class="text-sm mt-2">Click "Add Author" to search and start tracking.</p>
              </div>
            }
          >
            <div class="mb-4">
              <input
                type="text"
                placeholder="Filter authors by name, alias, or genre..."
                value={filterQuery()}
                onInput={(e) => setFilterQuery(e.currentTarget.value)}
                class="w-full max-w-md px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <Show
              when={filtered().length > 0}
              fallback={
                <div class="text-center py-12 text-gray-500">
                  <p class="text-lg">No authors match "{filterQuery().trim()}".</p>
                  <p class="text-sm mt-2">Try a different name, alias, or genre.</p>
                </div>
              }
            >
              <Show when={filterQuery().trim().length > 0}>
                <p class="text-sm text-gray-400 mb-3">
                  Showing {filtered().length} of {authors()?.authors.length ?? 0} authors
                </p>
              </Show>

              <Show
                when={view() === "grid"}
                fallback={
                  <div class="space-y-2">
                    <For each={filtered()}>
                      {(author) => (
                        <AuthorRow
                          href={paths.authors(author.id)}
                          imageUrl={author.image_url}
                          name={author.name}
                          subtitle={rowSubtitle(author)}
                        />
                      )}
                    </For>
                  </div>
                }
              >
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <For each={filtered()}>
                    {(author) => (
                      <AuthorCard
                        href={paths.authors(author.id)}
                        imageUrl={author.image_url}
                        name={author.name}
                        subtitle={
                          author.genres.length > 0
                            ? author.genres.slice(0, 2).join(", ")
                            : "No genres"
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
