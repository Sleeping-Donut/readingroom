import { useParams } from "@solidjs/router";
import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  Errored,
  For,
  Loading,
  Reveal,
  Show,
} from "solid-js";
import { Title } from "@solidjs/meta";
import { paths } from "../../router";
import { api } from "../../api/client";
import type { Author, Book } from "../../types";

interface Release {
  title: string;
  info_url: string;
  download_url: string;
  size: number;
  pub_date: string;
  indexer: string;
  download_type: string;
  seeders: number | null;
}

interface ScoredRelease {
  release: Release;
  score: number;
  matched_book_id?: number;
  reasons: string[];
}

export default function AuthorDetail() {
  const params = useParams(paths.authors);

  const author = createMemo(async () => api.get<Author>(`/authors/${params.id}`));

  const metadataBooks = createMemo(async () => {
    const name = author().name;
    if (!name) return null;
    return api.get<{ books: Book[]; total: number }>(`/books/search?q=${encodeURIComponent(name)}`);
  });

  const [indexerResults, setIndexerResults] = createSignal<{
    results: ScoredRelease[];
    total: number;
  } | null>(null);
  const [searching, setSearching] = createOptimistic(false);
  const [downloadingId, setDownloadingId] = createOptimistic<number | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const indexerSearch = action(async function* () {
    setSearching(true);
    setActionError(null);
    try {
      const res = await api.post<{ results: ScoredRelease[]; total: number }>(
        `/search/indexers/authors/${params.id}`,
      );
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
      await api.post("/search/indexers/download", { release, book_id: bookId });
      yield;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
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

      <Reveal order="natural">
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
            {/* Registered only once author() settles — read is inside the boundary. */}
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
                          {result.reasons.length > 0 &&
                            ` · ${result.reasons.slice(0, 2).join(", ")}`}
                        </p>
                      </div>
                      <span class="text-xs text-indigo-400 mr-2">
                        {result.release.download_type}
                      </span>
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
                  <h3 class="text-xl font-bold mb-4">Books by {author()?.name} (from metadata)</h3>
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <For each={mb().books}>
                      {(book) => (
                        <div class="block p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-indigo-600 transition-colors">
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
                            {book.publish_date && `${book.publish_date}`}
                          </p>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              )}
            </Show>
          </Loading>
        </Errored>
      </Reveal>
    </div>
  );
}
