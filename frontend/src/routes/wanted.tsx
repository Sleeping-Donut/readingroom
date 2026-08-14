import { Title } from "@solidjs/meta";
import {
  action,
  affects,
  createMemo,
  createOptimistic,
  createSignal,
  Errored,
  For,
  Loading,
  refresh,
  Show,
} from "solid-js";
import { api } from "../api/client";
import { paths } from "../router";
import type { Book } from "../types";

export default function Wanted() {
  const wanted = createMemo(async () => api.get<{ books: Book[]; total: number }>("/wanted"));
  const [searchingAll, setSearchingAll] = createOptimistic(false);
  const [searchingBookId, setSearchingBookId] = createOptimistic<number | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const searchAll = action(async function* () {
    setSearchingAll(true);
    setActionError(null);
    try {
      await api.post("/wanted/search");
      yield;
      affects(wanted);
      refresh(wanted);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  const searchBook = action(async function* (id: number) {
    setSearchingBookId(id);
    setActionError(null);
    try {
      await api.post(`/wanted/search/${id}`);
      yield;
      affects(wanted);
      refresh(wanted);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  return (
    <div>
      <Title>Wanted · ReadingRoom</Title>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">Wanted Books</h2>
        <button
          onClick={() => void searchAll()}
          disabled={searchingAll()}
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
        >
          {searchingAll() ? "Searching..." : "Search All"}
        </button>
      </div>

      <Show when={actionError()}>
        <p class="text-sm text-red-400 mb-4">{actionError()}</p>
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
          <Show when={wanted()} fallback={null}>
            {(w) => (
              <>
                <span class="text-sm text-gray-400 block mb-6">{w().total} missing</span>
                <Show
                  when={w().books.length > 0}
                  fallback={
                    <div class="text-center py-12 text-gray-500">
                      <p class="text-lg">All monitored books have files.</p>
                      <p class="text-sm mt-2">No missing books to search for.</p>
                    </div>
                  }
                >
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <For each={w().books}>
                      {(book) => (
                        <div class="p-4 bg-gray-900 rounded-lg border border-gray-800 relative group">
                          <span class="absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded bg-yellow-700 text-yellow-200">
                            Wanted
                          </span>
                          <a
                            href={String(paths.books(book.id))}
                            class="block hover:border-indigo-600 transition-colors"
                          >
                            <Show when={book.image_url}>
                              {(img) => (
                                <img
                                  src={img()}
                                  alt={book.title}
                                  class="w-full h-48 object-cover rounded mb-3"
                                />
                              )}
                            </Show>
                            <p class="font-medium truncate">{book.title}</p>
                            <p class="text-xs text-gray-400 mt-1">
                              {book.genres.length > 0
                                ? book.genres.slice(0, 2).join(", ")
                                : "No genres"}
                            </p>
                          </a>
                          <button
                            onClick={() => void searchBook(book.id)}
                            disabled={searchingBookId() === book.id}
                            class="mt-3 w-full px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 rounded text-xs font-medium transition-colors"
                          >
                            {searchingBookId() === book.id ? "Searching..." : "Search & Download"}
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </>
            )}
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}
