import { Title } from "@solidjs/meta";
import { revalidate, useNavigate, useParams } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
  action,
  createMemo,
  createOptimistic,
  createSignal,
  Errored,
  For,
  Loading,
  onSettled,
  Show,
} from "solid-js";

import { addBook, getBook, updateBookMonitored } from "../../api/books";
import { getQueue } from "../../api/queue";
import {
  downloadIndexerRelease,
  searchIndexersForBook,
  searchIndexersForTitle,
  type ScoredRelease,
} from "../../api/search";
import { getLibrarySettings } from "../../api/settings";
import { automaticSearchBook } from "../../api/wanted";
import { subscribeAll } from "../../api/ws";
import { BookCover } from "../../components/books/BookCover";
import { StatusBadge } from "../../components/books/StatusBadge";
import { paths } from "../../router";

export const route = defineFileRoute("/books/*id", {
  preload: ({ params }) => getBook(params.id),
});

const QUEUE_LABELS: Record<string, string> = {
  queued: "Pending",
  downloading: "Downloading",
  seeding: "Seeding",
  completed: "Completed",
  failed: "Failed",
  imported: "Imported",
  removed: "Removed",
};

function InfoRow(props: { label: string; value?: string | number }) {
  return (
    <Show when={props.value}>
      <div class="flex justify-between py-2 border-b border-gray-800">
        <span class="text-xs text-gray-400">{props.label}</span>
        <span class="text-sm text-right">{props.value}</span>
      </div>
    </Show>
  );
}

function ReleaseRow(props: {
  result: ScoredRelease;
  downloading: boolean;
  onDownload: () => void;
}) {
  const sizeMb = () =>
    props.result.release.size > 0
      ? `${(props.result.release.size / 1_000_000).toFixed(0)} MB`
      : "—";
  const seeders = () => (props.result.release.seeders != null ? props.result.release.seeders : "—");

  return (
    <tr class="border-b border-gray-800/50 hover:bg-gray-900/50">
      <td class="py-3 pr-4">
        <p class="font-medium truncate max-w-xs">{props.result.release.title}</p>
      </td>
      <td class="py-3 pr-4 text-gray-400">{props.result.release.indexer}</td>
      <td class="py-3 pr-4 text-gray-400 whitespace-nowrap">{sizeMb()}</td>
      <td class="py-3 pr-4 text-gray-400 whitespace-nowrap">{seeders()}</td>
      <td class="py-3 pr-4 whitespace-nowrap">
        <span class="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded text-xs font-semibold">
          {props.result.score.toFixed(0)}
        </span>
      </td>
      <td class="py-3 pr-4 whitespace-nowrap">
        <span class="px-2 py-0.5 bg-gray-800 text-gray-300 border border-gray-700 rounded text-xs">
          {props.result.release.download_type}
        </span>
      </td>
      <td class="py-3 whitespace-nowrap text-right">
        <button
          onClick={props.onDownload}
          disabled={props.downloading}
          class="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
        >
          {props.downloading ? "..." : "Download"}
        </button>
      </td>
    </tr>
  );
}

export default function BookDetail() {
  const params = useParams(paths.books);
  const navigate = useNavigate();

  const book = createMemo(() => getBook(params.id));

  const queue = createMemo(() => getQueue());

  const queueEntry = createMemo(() =>
    book().id > 0 ? queue()?.queue.find((e) => e.book_id === book().id) : undefined,
  );

  const library = createMemo(() =>
    book().status === "have" ? getLibrarySettings().catch(() => null) : null,
  );

  const [searchOpen, setSearchOpen] = createSignal(false);
  const [indexerResults, setIndexerResults] = createSignal<{
    results: ScoredRelease[];
    total: number;
  } | null>(null);
  const [searching, setSearching] = createSignal(false);
  const [downloadingId, setDownloadingId] = createSignal<number | null>(null);
  const [adding, setAdding] = createSignal(false);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [autoSearching, setAutoSearching] = createSignal(false);
  const [savingMonitored, setSavingMonitored] = createSignal(false);

  // Optimistic view of the book's monitored flag: mirrors the server value
  // from getBook(), but writes made inside an action show immediately and
  // revert to the server value once the action settles (revalidated below).
  const [monitored, setMonitored] = createOptimistic(() => book().monitored);

  onSettled(() => {
    const pollId = setInterval(() => revalidate(getQueue.key), 30000);
    const unsub = subscribeAll(() => revalidate(getQueue.key));
    return () => {
      clearInterval(pollId);
      unsub();
    };
  });

  const indexerSearch = action(async function* () {
    setSearching(true);
    setActionError(null);
    try {
      const id = book().id;
      const res =
        id > 0 ? await searchIndexersForBook(id) : await searchIndexersForTitle(book().title);
      yield;
      setIndexerResults(res);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSearching(false);
    }
  });

  const openSearch = () => {
    setSearchOpen(true);
    void indexerSearch();
  };

  const downloadRelease = action(async function* (result: ScoredRelease, index: number) {
    setDownloadingId(index);
    setActionError(null);
    try {
      const bookId = result.matched_book_id ?? (book().id > 0 ? book().id : undefined);
      await downloadIndexerRelease(result.release, bookId);
      yield;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setDownloadingId(null);
    }
  });

  const addToLibrary = action(async function* () {
    setAdding(true);
    setActionError(null);
    try {
      const created = await addBook({
        foreign_id: book().foreign_id,
        author_id: book().author_id,
        title: book().title,
      });
      yield;
      navigate(paths.books(created.book.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAdding(false);
    }
  });

  const autoSearch = action(async function* () {
    setAutoSearching(true);
    setActionError(null);
    try {
      const res = yield automaticSearchBook(book().id);
      if (res.status === "no_match") {
        setActionError(res.message ?? "No release scored above threshold");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAutoSearching(false);
    }
    revalidate(getQueue.key);
    revalidate(getBook.key);
  });

  const toggleMonitored = action(async function* () {
    setSavingMonitored(true);
    setActionError(null);
    const next = !monitored();
    setMonitored(next);
    try {
      yield updateBookMonitored(book().id, next);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSavingMonitored(false);
    }
    revalidate(getBook.key);
  });

  return (
    <div>
      <a href="/books" class="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block">
        &larr; Back to Books
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
          <Title>{book().title} · ReadingRoom</Title>
          <div class="flex flex-col sm:flex-row gap-6 sm:gap-8 mt-4">
            <BookCover
              src={book().image_url}
              alt={book().title}
              class="w-40 sm:w-48 aspect-[2/3] rounded-lg shadow-lg shrink-0"
              emojiClass="text-5xl"
            />
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-3 mb-1">
                    <h2 class="text-3xl font-bold">{book().title}</h2>
                    <StatusBadge status={book().status} />
                  </div>
                  <Show when={book().author_name}>
                    <a
                      href={paths.authors(book().author_id)}
                      class="text-lg text-indigo-400 hover:text-indigo-300"
                    >
                      {book().author_name}
                    </a>
                  </Show>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <Show when={book().id > 0}>
                    <button
                      onClick={() => void autoSearch()}
                      disabled={autoSearching()}
                      class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      {autoSearching() ? "Searching..." : "Automatic Search"}
                    </button>
                    <button
                      onClick={() => void toggleMonitored()}
                      disabled={savingMonitored()}
                      class={[
                        "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        monitored()
                          ? "bg-green-700 hover:bg-green-600 text-white"
                          : "bg-gray-700 hover:bg-gray-600 text-gray-300",
                      ]}
                    >
                      {monitored() ? "Monitored" : "Unmonitored"}
                    </button>
                  </Show>
                  <button
                    onClick={openSearch}
                    disabled={searching()}
                    class="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    {searching() ? "Searching..." : "Interactive Search"}
                  </button>
                  <Show when={book().id === 0}>
                    <button
                      onClick={() => void addToLibrary()}
                      disabled={adding()}
                      class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      {adding() ? "Adding..." : "Add to Library"}
                    </button>
                  </Show>
                </div>
              </div>

              <div class="mt-4 max-w-md">
                <InfoRow label="Publisher" value={book().publisher} />
                <InfoRow label="Published" value={book().publish_date} />
                <InfoRow label="Language" value={book().language} />
                <InfoRow label="Pages" value={book().pages} />
                <InfoRow label="ISBN" value={book().isbn ?? book().isbn13} />
                <InfoRow label="Rating" value={book().ratings?.toFixed(1)} />
              </div>

              <Show when={book().genres.length > 0}>
                <div class="mt-4 flex gap-2 flex-wrap">
                  <For each={book().genres}>
                    {(g) => (
                      <span class="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300">{g}</span>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={book().description}>
                <p class="mt-4 text-gray-300 leading-relaxed">{book().description}</p>
              </Show>
            </div>
          </div>
        </Loading>
      </Errored>

      <Show when={actionError()}>
        <p class="text-sm text-red-400 mt-4">{actionError()}</p>
      </Show>

      <Show when={searchOpen()}>
        <section class="mt-8">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 class="text-xl font-bold">Interactive Search</h3>
              <p class="text-xs text-gray-500 mt-0.5">
                {book().title}
                <Show when={indexerResults()}>{(r) => ` · ${r().total} results`}</Show>
              </p>
            </div>
            <button
              onClick={() => void indexerSearch()}
              disabled={searching()}
              class="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              {searching() ? "Searching..." : "Search again"}
            </button>
          </div>
          <Show
            when={indexerResults()}
            fallback={
              <p class="text-sm text-gray-500">
                {searching() ? "Searching indexers..." : "Click Search Indexers to find releases."}
              </p>
            }
          >
            {(r) => (
              <Show
                when={r().results.length > 0}
                fallback={<p class="text-sm text-gray-500">No releases found.</p>}
              >
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-gray-400 border-b border-gray-800">
                        <th class="pb-3 pr-4">Title</th>
                        <th class="pb-3 pr-4">Indexer</th>
                        <th class="pb-3 pr-4">Size</th>
                        <th class="pb-3 pr-4">Seeders</th>
                        <th class="pb-3 pr-4">Score</th>
                        <th class="pb-3 pr-4">Type</th>
                        <th class="pb-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={r().results}>
                        {(result, index) => (
                          <ReleaseRow
                            result={result}
                            downloading={downloadingId() === index()}
                            onDownload={() => void downloadRelease(result, index())}
                          />
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            )}
          </Show>
        </section>
      </Show>

      <Errored fallback={null}>
        <Loading fallback={null}>
          <Show when={queueEntry() || (book().status === "have" && library())}>
            <div class="mt-8 grid gap-6 max-w-3xl sm:grid-cols-2">
              <Show when={queueEntry()}>
                {(entry) => {
                  const size = () => entry().size ?? 0;
                  return (
                    <section>
                      <h3 class="text-xl font-bold mb-4">Download Status</h3>
                      <div class="p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-2">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-sm font-medium">
                            {QUEUE_LABELS[entry().status] ?? entry().status}
                          </span>
                          <span class="text-xs text-indigo-400">{entry().download_client}</span>
                        </div>
                        <Show when={entry().title && entry().title !== book().title}>
                          <p class="text-xs text-gray-400 truncate">{entry().title}</p>
                        </Show>
                        <Show
                          when={
                            entry().status === "queued" ||
                            entry().status === "downloading" ||
                            entry().status === "seeding"
                          }
                        >
                          <div class="w-full bg-gray-800 rounded-full h-1.5">
                            <div
                              class="bg-indigo-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.round(entry().progress * 100)}%` }}
                            />
                          </div>
                          <p class="text-xs text-gray-400">
                            {Math.round(entry().progress * 100)}% complete
                          </p>
                        </Show>
                        <Show when={size() > 0}>
                          <p class="text-xs text-gray-400">{(size() / 1_000_000).toFixed(1)} MB</p>
                        </Show>
                      </div>
                    </section>
                  );
                }}
              </Show>
              <Show when={book().status === "have" && library()}>
                {(lib) => (
                  <section>
                    <h3 class="text-xl font-bold mb-4">Files</h3>
                    <div class="p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-2">
                      <p class="text-sm font-medium text-green-400">✓ Saved to library</p>
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs text-gray-400">Status</span>
                        <StatusBadge status={book().status} />
                      </div>
                      <Show when={lib().library.root_folder}>
                        <div>
                          <p class="text-xs text-gray-400">Library location</p>
                          <p class="text-xs font-mono text-gray-300 break-all">
                            {lib().library.root_folder}
                          </p>
                        </div>
                      </Show>
                    </div>
                  </section>
                )}
              </Show>
            </div>
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}
