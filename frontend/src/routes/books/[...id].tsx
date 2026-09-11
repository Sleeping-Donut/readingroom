import { Dialog } from "@kobalte/core/dialog";
import { createPagination, createSegment } from "@solid-primitives/pagination";
import { createTimer } from "@solid-primitives/timer";
import { Title } from "@solidjs/meta";
import { revalidate, useNavigate, useParams } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
	action,
	createEffect,
	createMemo,
	createOptimistic,
	createSignal,
	Errored,
	For,
	Loading,
	onSettled,
	Show,
} from "solid-js";

import type { Edition, MediaType } from "../../types";

import { authorId } from "../../api/authors";
import {
	addBook,
	bookId,
	getAudiobookEditions,
	getBook,
	getBookEditions,
	getBooks,
	updateBookMonitored,
} from "../../api/books";
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
import { BookDetailSkeleton, EditionListSkeleton } from "../../components/books/BookSkeletons";
import { StatusBadge } from "../../components/books/StatusBadge";
import { createBooks } from "../../resources/books";
import { paths } from "../../router";

export const route = defineFileRoute("/books/*id", {
	preload: ({ params }) => {
		void getBook(params.id);
		void getBooks();
	},
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

const FORMAT_LABELS: Record<string, string> = {
	EBook: "E-book",
	AudioBook: "Audiobook",
	Physical: "Physical",
};

const EDITION_FORMAT: Record<MediaType, string> = {
	ebook: "EBook",
	audiobook: "AudioBook",
};

const MEDIA_LABELS: Record<MediaType, string> = {
	ebook: "Ebook",
	audiobook: "Audiobook",
};

type SearchRequest = { kind: "book" } | { kind: "title"; title: string };

function MediaTabs(props: { media: MediaType; onChange: (media: MediaType) => void }) {
	const button = (value: MediaType, label: string) => (
		<button
			onClick={() => props.onChange(value)}
			class={[
				"rounded px-3 py-1.5 text-sm font-medium transition-colors",
				props.media === value
					? "bg-ink-900 text-paper-50"
					: "bg-transparent text-ink-500 hover:text-ink-900",
			]}
		>
			{label}
		</button>
	);

	return (
		<div class="mt-6 inline-flex gap-1 rounded-sm border border-rule bg-paper-100 p-1">
			{button("ebook", "Ebooks")}
			{button("audiobook", "Audiobooks")}
		</div>
	);
}

function EditionRow(props: {
	edition: Edition;
	showAdd: boolean;
	adding: boolean;
	onAdd: () => void;
	onInteractiveAdd: () => void;
}) {
	const format = () => FORMAT_LABELS[props.edition.format] ?? props.edition.format;
	const meta = () =>
		[
			format(),
			props.edition.publisher,
			props.edition.pages ? `${props.edition.pages} pages` : "",
			props.edition.release_date,
		]
			.filter(Boolean)
			.join(" · ");

	return (
		<div class="flex gap-3 rounded-sm border border-rule bg-paper-100 p-3">
			<BookCover
				src={props.edition.image_url}
				alt={props.edition.title}
				class="h-16 w-auto shrink-0 rounded object-contain"
			/>
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">{props.edition.title}</p>
				<p class="text-xs text-ink-700">{meta()}</p>
				<Show when={props.edition.isbn13}>
					<p class="text-xs text-ink-500">ISBN: {props.edition.isbn13}</p>
				</Show>
			</div>
			<div class="flex items-center gap-2">
				<Show when={props.showAdd}>
					<button
						onClick={props.onAdd}
						disabled={props.adding}
						class="shrink-0 rounded bg-good px-3 py-1.5 text-xs font-medium text-paper-50 transition-colors hover:opacity-90 disabled:opacity-50"
					>
						{props.adding ? "Adding..." : "Add"}
					</button>
				</Show>
				<button
					onClick={props.onInteractiveAdd}
					class="shrink-0 rounded bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper-50 transition-colors hover:bg-ink-700"
				>
					Interactive Add
				</button>
			</div>
		</div>
	);
}

function InfoRow(props: { label: string; value?: string | number }) {
	return (
		<Show when={props.value}>
			<div class="flex justify-between border-b border-rule py-2">
				<span class="text-xs text-ink-700">{props.label}</span>
				<span class="text-right text-sm">{props.value}</span>
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
	const seeders = () =>
		props.result.release.seeders != null ? props.result.release.seeders : "—";

	return (
		<tr class="border-b border-rule hover:bg-paper-200">
			<td class="py-3 pr-4">
				<Show
					when={props.result.release.info_url || props.result.release.download_url}
					fallback={
						<p class="max-w-xs truncate font-medium" title={props.result.release.title}>
							{props.result.release.title}
						</p>
					}
				>
					{(url) => (
						<a
							href={url()}
							target="_blank"
							rel="noopener noreferrer"
							class="block max-w-xs truncate font-medium text-accent hover:underline"
							title={props.result.release.title}
						>
							{props.result.release.title}
						</a>
					)}
				</Show>
			</td>
			<td class="py-3 pr-4 text-ink-700">{props.result.release.indexer}</td>
			<td class="py-3 pr-4 whitespace-nowrap text-ink-700">{sizeMb()}</td>
			<td class="py-3 pr-4 whitespace-nowrap text-ink-700">{seeders()}</td>
			<td class="py-3 pr-4 whitespace-nowrap">
				<span class="rounded border border-accent/30 bg-accent-wash px-2 py-0.5 text-xs font-semibold text-accent">
					{props.result.score.toFixed(0)}
				</span>
			</td>
			<td class="py-3 pr-4 whitespace-nowrap">
				<span class="rounded-sm border border-rule bg-paper-200 px-2 py-0.5 font-meta text-xs text-ink-700 uppercase">
					{props.result.release.download_type}
				</span>
			</td>
			<td class="py-3 text-right whitespace-nowrap">
				<button
					onClick={props.onDownload}
					disabled={props.downloading}
					class="rounded bg-good px-3 py-1.5 text-xs font-medium text-paper-50 transition-colors hover:opacity-90 disabled:opacity-50"
				>
					{props.downloading ? "..." : "Download"}
				</button>
			</td>
		</tr>
	);
}

// Interactive search is scoped to a single media type. The dialog owns its own
// results/pagination state and re-runs whenever it opens or the media/request
// changes, so switching tabs never leaks the other media's results.
function MediaSearchDialog(props: {
	media: MediaType;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bookId: number;
	bookTitle: string;
	request: SearchRequest;
	onError: (message: string | null) => void;
}) {
	const [indexerResults, setIndexerResults] = createSignal<{
		results: ScoredRelease[];
		total: number;
	} | null>(null);
	const [searching, setSearching] = createOptimistic(false);
	// Keyed busy flags for per-row buttons; no store row to hang pending on.
	const [downloadingId, setDownloadingId] = createOptimistic<number | null>(null);

	const SEARCH_PAGE_SIZE = 25;
	const searchMaxPage = createMemo(() =>
		Math.max(1, Math.ceil((indexerResults()?.total ?? 0) / SEARCH_PAGE_SIZE)),
	);
	const [searchPaginationProps, searchPage, setSearchPage] = createPagination(() => ({
		pages: searchMaxPage(),
	}));
	const searchResultItems = createMemo(() => indexerResults()?.results ?? []);
	const pagedSearchResults = createSegment(searchResultItems, SEARCH_PAGE_SIZE, searchPage);

	const searchTitle = () =>
		props.request.kind === "title" ? props.request.title : props.bookTitle;

	const runSearch = action(async function* (request: SearchRequest, media: MediaType) {
		setSearching(true);
		props.onError(null);
		setSearchPage(1);
		try {
			const res =
				request.kind === "title"
					? await searchIndexersForTitle(request.title, media)
					: await searchIndexersForBook(props.bookId, media);
			yield;
			setIndexerResults(res);
		} catch (err) {
			props.onError(err instanceof Error ? err.message : "Request failed");
		}
	});

	createEffect(
		() => ({ open: props.open, request: props.request, media: props.media }),
		({ open, request, media }) => {
			if (!open) return;
			setIndexerResults(null);
			void runSearch(request, media);
		},
	);

	const downloadRelease = action(async function* (result: ScoredRelease, index: number) {
		setDownloadingId(index);
		props.onError(null);
		try {
			const bookId = result.matched_book_id ?? (props.bookId > 0 ? props.bookId : undefined);
			await downloadIndexerRelease(result.release, bookId);
			yield;
		} catch (err) {
			props.onError(err instanceof Error ? err.message : "Request failed");
		}
	});

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay class="fixed inset-0 z-40 bg-ink-900/40" />
				<Dialog.Content class="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(92vw,60rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-rule bg-paper-50 shadow-xl">
					<div class="flex flex-wrap items-center justify-between gap-3 border-b border-rule p-4">
						<div>
							<Dialog.Title class="text-xl font-bold">
								Interactive Search
							</Dialog.Title>
							<Dialog.Description class="mt-0.5 text-xs text-ink-500">
								{searchTitle()}
								<Show when={indexerResults()}>
									{(r) => ` · ${r().total} results`}
								</Show>
							</Dialog.Description>
						</div>
						<div class="flex items-center gap-2">
							<button
								onClick={() => void runSearch(props.request, props.media)}
								disabled={searching()}
								class="rounded bg-ink-900 px-3 py-1.5 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
							>
								{searching() ? "Searching..." : "Search again"}
							</button>
							<Dialog.CloseButton class="rounded border border-rule px-3 py-1.5 text-sm text-ink-700 transition-colors hover:bg-paper-200">
								Close
							</Dialog.CloseButton>
						</div>
					</div>
					<div class="min-h-0 flex-1 overflow-y-auto p-4">
						<Show
							when={indexerResults()}
							fallback={
								<p class="text-sm text-ink-500">
									{searching()
										? "Searching indexers..."
										: "Click Search Indexers to find releases."}
								</p>
							}
						>
							{(r) => (
								<Show
									when={r().results.length > 0}
									fallback={
										<p class="text-sm text-ink-500">No releases found.</p>
									}
								>
									<div class="overflow-x-auto">
										<table class="w-full text-sm">
											<thead>
												<tr class="border-b border-rule text-left font-meta text-xs tracking-widest text-ink-500 uppercase">
													<th class="pr-4 pb-3">Title</th>
													<th class="pr-4 pb-3">Indexer</th>
													<th class="pr-4 pb-3">Size</th>
													<th class="pr-4 pb-3">Seeders</th>
													<th class="pr-4 pb-3">Score</th>
													<th class="pr-4 pb-3">Type</th>
													<th>
														<span class="sr-only">Actions</span>
													</th>
												</tr>
											</thead>
											<tbody>
												<For each={pagedSearchResults()}>
													{(result) => {
														const globalIndex = () =>
															(searchPage() - 1) * SEARCH_PAGE_SIZE +
															pagedSearchResults().indexOf(result);
														return (
															<ReleaseRow
																result={result}
																downloading={
																	downloadingId() ===
																	globalIndex()
																}
																onDownload={() =>
																	void downloadRelease(
																		result,
																		globalIndex(),
																	)
																}
															/>
														);
													}}
												</For>
											</tbody>
										</table>
									</div>
									<Show when={searchMaxPage() > 1}>
										<nav class="mt-4 flex items-center justify-center gap-1">
											<For each={searchPaginationProps()}>
												{(props) => (
													<button
														{...props}
														class="rounded-sm border border-rule px-3 py-1.5 font-meta text-xs text-ink-700 disabled:opacity-40 aria-[current]:border-ink-900 aria-[current]:font-medium aria-[current]:text-ink-900"
													/>
												)}
											</For>
										</nav>
									</Show>
								</Show>
							)}
						</Show>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}

export default function BookDetail() {
	const params = useParams(paths.books);
	const navigate = useNavigate();

	const back = () => {
		if (window.history.length > 1) navigate(-1);
		else navigate(paths.books, { replace: true });
	};

	const book = createMemo(() => getBook(params.id));

	// The tracked book from the shared books store, so the stored title/status
	// render immediately instead of blanking the whole page on the detail load.
	const [tracked] = createBooks();
	// Tracked-book lookup by the canonical bare OL id — the only param shape
	// the app generates. Null = untracked (metadata-only) book.
	const storedBook = createMemo(() => {
		const p = params.id;
		return tracked.books.find((b) => bookId(b) === p) ?? null;
	});

	const queue = createMemo(() => getQueue());

	const editions = createMemo(() => getBookEditions(params.id));
	// Audiobook editions come from Audible (reconciled via this book's title +
	// author), not the OpenLibrary editions list.
	const audiobookEditions = createMemo(() => getAudiobookEditions(params.id));

	const queueEntry = createMemo(() =>
		book().id > 0 ? queue()?.queue.find((e) => e.book_id === book().id) : undefined,
	);

	const library = createMemo(() =>
		book().status === "have" ? getLibrarySettings().catch(() => null) : null,
	);

	const [media, setMedia] = createSignal<MediaType>("ebook");
	const mediaLabel = () => MEDIA_LABELS[media()];

	const [searchOpen, setSearchOpen] = createSignal(false);
	const [searchRequest, setSearchRequest] = createSignal<SearchRequest>({ kind: "book" });
	const [adding, setAdding] = createOptimistic(false);
	const [actionError, setActionError] = createSignal<string | null>(null);
	const [autoSearching, setAutoSearching] = createOptimistic(false);
	const [savingMonitored, setSavingMonitored] = createOptimistic(false);
	const [showAllTags, setShowAllTags] = createSignal(false);
	const [addingEditionId, setAddingEditionId] = createOptimistic<string | null>(null);

	// Optimistic view of the active media's monitored flag: mirrors the server
	// value from getBook(), but writes made inside an action show immediately
	// and revert to the server value once the action settles (revalidated below).
	const [monitored, setMonitored] = createOptimistic(() =>
		media() === "audiobook" ? (book().monitored_audiobook ?? false) : book().monitored,
	);

	onSettled(() => {
		createTimer(() => revalidate(getQueue.key), 30_000, setInterval);
		const unsub = subscribeAll(() => revalidate(getQueue.key));
		return unsub;
	});

	const openBookSearch = () => {
		setSearchRequest({ kind: "book" });
		setSearchOpen(true);
	};

	const openEditionSearch = (edition: Edition) => {
		setSearchRequest({ kind: "title", title: edition.title });
		setSearchOpen(true);
	};

	const addToLibrary = action(async function* () {
		setAdding(true);
		setActionError(null);
		try {
			const created = await addBook({
				foreign_id: book().foreign_id,
				author_id: book().author_id,
				title: book().title,
				author_name: book().author_name,
			});
			yield;
			revalidate(getBook.key);
			revalidate(getBooks.key);
			navigate(paths.books(bookId(created.book)));
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
		}
	});

	const addEdition = action(async function* (edition: Edition) {
		setAddingEditionId(edition.foreign_edition_id ?? edition.title);
		setActionError(null);
		try {
			const created = await addBook({
				foreign_id: edition.foreign_edition_id ?? book().foreign_id,
				author_id: book().author_id,
				title: edition.title,
				author_name: book().author_name,
			});
			yield;
			revalidate(getBooks.key);
			navigate(paths.books(bookId(created.book)));
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
		}
	});

	const autoSearch = action(async function* () {
		setAutoSearching(true);
		setActionError(null);
		try {
			const res = yield automaticSearchBook(book().id, media());
			if (res.status === "no_match") {
				setActionError(res.message ?? "No release scored above threshold");
			}
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
		}
		revalidate(getQueue.key);
		revalidate(getBook.key);
	});

	const toggleMonitored = action(async function* () {
		setSavingMonitored(true);
		setActionError(null);
		const next = !monitored();
		const activeMedia = media();
		setMonitored(next);
		try {
			yield updateBookMonitored(book().id, next, activeMedia);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
		}
		revalidate(getBook.key);
	});

	return (
		<div>
			<button
				onClick={back}
				class="mb-4 inline-block text-sm text-accent underline-offset-2 hover:text-ink-900"
			>
				&larr; Back
			</button>

			<Show when={storedBook()}>
				{(stored) => (
					<div class="mb-1 flex flex-wrap items-center gap-3">
						<h2 class="font-display text-4xl text-ink-900">{stored().title}</h2>
						<StatusBadge status={stored().status} />
						<Show when={stored().author_name}>
							<a
								href={paths.authors(
									authorId({
										foreign_id:
											book().author_foreign_id ?? stored().author_foreign_id,
									}),
								)}
								class="font-display text-lg text-accent italic underline-offset-2 hover:text-ink-900"
							>
								{stored().author_name}
							</a>
						</Show>
					</div>
				)}
			</Show>

			<Errored
				fallback={(err, reset) => (
					<p class="mt-2 text-sm text-bad">
						Failed to load: {String(err())}{" "}
						<button onClick={reset} class="ml-1 text-accent underline">
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<BookDetailSkeleton withHeader={!storedBook()} />}>
					<Title>{book().title} · ReadingRoom</Title>
					<div class="mt-4 flex flex-col gap-6 sm:flex-row sm:gap-8">
						<BookCover
							src={book().image_url}
							alt={book().title}
							class="w-40 shrink-0 self-start rounded-sm sm:w-48"
							emojiClass="text-5xl"
						/>
						<div class="min-w-0 flex-1">
							<Show when={!storedBook()}>
								<div class="min-w-0">
									<div class="mb-1 flex flex-wrap items-center gap-3">
										<h2 class="font-display text-4xl text-ink-900">
											{book().title}
										</h2>
										<StatusBadge status={book().status} />
									</div>
									<Show when={book().author_name}>
										<a
											href={paths.authors(
												authorId({
													foreign_id: book().author_foreign_id,
												}),
											)}
											class="font-display text-lg text-accent italic underline-offset-2 hover:text-ink-900"
										>
											{book().author_name}
										</a>
									</Show>
								</div>
							</Show>

							<div class="mt-4 max-w-md">
								<InfoRow label="Publisher" value={book().publisher} />
								<InfoRow label="Published" value={book().publish_date} />
								<InfoRow label="Language" value={book().language} />
								<InfoRow label="Pages" value={book().pages} />
								<InfoRow label="ISBN" value={book().isbn ?? book().isbn13} />
								<InfoRow label="Rating" value={book().ratings?.toFixed(1)} />
							</div>

							<Show when={(book().genres?.length ?? 0) > 0}>
								<div
									class={
										showAllTags()
											? "mt-4 flex flex-wrap gap-2"
											: "mt-4 flex max-h-[2.5rem] flex-wrap gap-2 overflow-hidden"
									}
								>
									<For each={book().genres ?? []}>
										{(g) => (
											<span class="rounded-sm bg-paper-200 px-2 py-1 font-meta text-xs text-ink-700 uppercase">
												{g}
											</span>
										)}
									</For>
								</div>
								<Show when={(book().genres?.length ?? 0) > 6}>
									<button
										onClick={() => setShowAllTags((v) => !v)}
										class="mt-1 text-xs text-accent underline-offset-2 hover:text-ink-900"
									>
										{showAllTags()
											? "Show less"
											: `Show all (${book().genres?.length ?? 0})`}
									</button>
								</Show>
							</Show>

							<Show when={book().description}>
								<p class="mt-4 leading-relaxed text-ink-900">
									{book().description}
								</p>
							</Show>
						</div>
					</div>

					<MediaTabs media={media()} onChange={setMedia} />

					<div class="mt-4 flex flex-wrap items-center gap-3">
						<h3 class="text-xl font-bold">{mediaLabel()}</h3>
						<Show when={book().id > 0}>
							<span
								class={
									monitored()
										? "rounded border border-good/30 bg-good/10 px-2 py-0.5 text-xs font-medium text-good"
										: "rounded border border-rule bg-paper-200 px-2 py-0.5 text-xs font-medium text-ink-700"
								}
							>
								{monitored() ? "Monitored" : "Not monitored"}
							</span>
						</Show>
					</div>

					<div class="mt-4 flex flex-wrap items-center gap-2">
						<Show when={book().id > 0}>
							<button
								onClick={() => void autoSearch()}
								disabled={autoSearching()}
								class="rounded-lg bg-good px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:opacity-90 disabled:opacity-50"
							>
								{autoSearching() ? "Searching..." : "Automatic Search"}
							</button>
							<button
								onClick={() => void toggleMonitored()}
								disabled={savingMonitored()}
								title={monitored() ? "Unmonitored" : "Monitored"}
								class={[
									"flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
									monitored()
										? "bg-good text-paper-50 hover:opacity-90"
										: "bg-paper-200 text-ink-900 hover:bg-paper-200",
								]}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill={monitored() ? "currentColor" : "none"}
									stroke="currentColor"
									stroke-width="2"
									class="h-5 w-5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z"
									/>
								</svg>
								<span class="sr-only">
									{monitored() ? "Unmonitored" : "Monitored"}
								</span>
							</button>
							<button
								onClick={openBookSearch}
								class="flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
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
								Interactive Search
							</button>
						</Show>
						<Show when={book().id === 0}>
							<button
								onClick={() => void addToLibrary()}
								disabled={adding()}
								class="rounded-lg bg-good px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:opacity-90 disabled:opacity-50"
							>
								{adding() ? "Adding..." : "Add to Library"}
							</button>
						</Show>
					</div>

					<Errored fallback={null}>
						<Loading fallback={null}>
							<Show when={queueEntry() || (book().status === "have" && library())}>
								<div class="mt-8 grid max-w-3xl gap-6 sm:grid-cols-2">
									<Show when={queueEntry()}>
										{(entry) => {
											const size = () => entry().size ?? 0;
											return (
												<section>
													<h3 class="mb-4 text-xl font-bold">
														Download Status
													</h3>
													<div class="space-y-2 rounded-sm border border-rule bg-paper-100 p-4">
														<div class="flex items-center justify-between gap-2">
															<span class="text-sm font-medium">
																{QUEUE_LABELS[entry().status] ??
																	entry().status}
															</span>
															<span class="text-xs text-accent">
																{entry().download_client}
															</span>
														</div>
														<Show
															when={
																entry().title &&
																entry().title !== book().title
															}
														>
															<p class="truncate text-xs text-ink-700">
																{entry().title}
															</p>
														</Show>
														<Show
															when={
																entry().status === "queued" ||
																entry().status === "downloading" ||
																entry().status === "seeding"
															}
														>
															<div class="h-1.5 w-full rounded-full bg-rule">
																<div
																	class="h-1.5 rounded-full bg-accent transition-all"
																	style={{
																		width: `${Math.round(entry().progress * 100)}%`,
																	}}
																/>
															</div>
															<p class="text-xs text-ink-700">
																{Math.round(entry().progress * 100)}
																% complete
															</p>
														</Show>
														<Show when={size() > 0}>
															<p class="text-xs text-ink-700">
																{(size() / 1_000_000).toFixed(1)} MB
															</p>
														</Show>
													</div>
												</section>
											);
										}}
									</Show>
									<Show when={book().status === "have" && library()}>
										{(lib) => (
											<section>
												<h3 class="mb-4 text-xl font-bold">Files</h3>
												<div class="space-y-2 rounded-sm border border-rule bg-paper-100 p-4">
													<p class="text-sm font-medium text-good">
														✓ Saved to library
													</p>
													<div class="flex items-center justify-between gap-2">
														<span class="text-xs text-ink-700">
															Status
														</span>
														<StatusBadge status={book().status} />
													</div>
													<Show when={lib().library.root_folder}>
														<div>
															<p class="text-xs text-ink-700">
																Library location
															</p>
															<p class="font-mono text-xs break-all text-ink-900">
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

					<Errored fallback={null}>
						<Loading fallback={<EditionListSkeleton />}>
							<Show when={editions()}>
								{(list) => {
									const filtered = () =>
										list().editions.filter(
											(e) => e.format === EDITION_FORMAT[media()],
										);
									return (
										<Show when={filtered().length > 0}>
											<section class="mt-8 max-w-3xl">
												<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
													<div>
														<h3 class="text-xl font-bold">
															{mediaLabel()} Editions
														</h3>
														<p class="mt-0.5 text-xs text-ink-500">
															{book().title}
															<Show when={book().id === 0}>
																{
																	" · add a specific edition to your library"
																}
															</Show>
														</p>
													</div>
													<span class="text-xs text-ink-500">
														{filtered().length} total
													</span>
												</div>
												<div class="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
													<For each={filtered()}>
														{(edition) => (
															<EditionRow
																edition={edition}
																showAdd={book().id === 0}
																adding={
																	addingEditionId() ===
																	(edition.foreign_edition_id ??
																		edition.title)
																}
																onAdd={() =>
																	void addEdition(edition)
																}
																onInteractiveAdd={() =>
																	openEditionSearch(edition)
																}
															/>
														)}
													</For>
												</div>
											</section>
										</Show>
									);
								}}
							</Show>
						</Loading>
					</Errored>
				</Loading>
			</Errored>

			<Show when={media() === "audiobook"}>
				<Errored fallback={null}>
					<Loading fallback={<EditionListSkeleton />}>
						<Show when={audiobookEditions()}>
							{(res) => (
								<Show when={(res().editions ?? []).length > 0}>
									<section class="mt-8 max-w-3xl">
										<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
											<div>
												<h3 class="text-xl font-bold">
													Audiobook Editions
												</h3>
												<p class="mt-0.5 text-xs text-ink-500">
													{book().title} · from Audible
												</p>
											</div>
											<span class="text-xs text-ink-500">
												{res().editions.length} total
											</span>
										</div>
										<div class="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
											<For each={res().editions}>
												{(edition) => (
													<EditionRow
														edition={edition}
														showAdd={book().id === 0}
														adding={
															addingEditionId() ===
															(edition.foreign_edition_id ??
																edition.title)
														}
														onAdd={() => void addEdition(edition)}
														onInteractiveAdd={() =>
															openEditionSearch(edition)
														}
													/>
												)}
											</For>
										</div>
									</section>
								</Show>
							)}
						</Show>
					</Loading>
				</Errored>
			</Show>

			<Show when={actionError()}>
				<p class="mt-4 text-sm text-bad">{actionError()}</p>
			</Show>

			<MediaSearchDialog
				media={media()}
				open={searchOpen()}
				onOpenChange={setSearchOpen}
				bookId={book().id}
				bookTitle={book().title}
				request={searchRequest()}
				onError={setActionError}
			/>
		</div>
	);
}
