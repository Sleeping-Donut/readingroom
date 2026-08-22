import { Title } from "@solidjs/meta";
import { useSearchParams, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";
import * as v from "valibot";

import type { Book } from "../../types";

import { getBooks, bookId, searchBooks } from "../../api/books";
import { BookCard } from "../../components/books/BookCard";
import { BookRow } from "../../components/books/BookRow";
import { ViewToggle, createViewPreference } from "../../components/ViewToggle";
import { createBooks } from "../../resources/books";
import { paths } from "../../router";

export const route = defineFileRoute("/books", {
	search: v.object({ q: v.optional(v.string()) }),
	preload: () => getBooks(),
});

const yearOf = (date?: string) => date?.match(/\d{4}/)?.[0];

const listSubtitle = (book: { author_name?: string; genres: string[]; publish_date?: string }) => {
	const base = book.author_name || book.genres.slice(0, 2).join(", ") || "Unknown author";
	const year = yearOf(book.publish_date);
	return year ? `${base} · ${year}` : base;
};

export default function Books(_props: RouteProps<typeof route>) {
	const [searchQuery, setSearchQuery] = createSignal("");
	const [showSearch, setShowSearch] = createSignal(false);
	// Busy flag for a search-result row; search results aren't store rows, so
	// there's no pending affordance to hang this on.
	const [addingId, setAddingId] = createSignal<string | null>(null);
	const [actionError, setActionError] = createSignal<string | null>(null);
	const [view, setView] = createViewPreference("books");
	const [search, setSearch] = useSearchParams(paths.books);

	const [books, { addBook }] = createBooks();

	const filterQuery = () => search.q ?? "";

	// Empty result (not null) while the query is empty; the JSX gates "idle"
	// on the query so an open panel doesn't read as "no matches".
	const EMPTY_SEARCH = { books: [] as Book[], total: 0 };
	const searchResults = createMemo(async () => {
		const q = searchQuery().trim();
		if (!q) return EMPTY_SEARCH;
		return searchBooks(q);
	});

	const filteredBooks = createMemo(() => {
		const q = filterQuery().trim().toLowerCase();
		const all = books.books;
		if (!q) return all;
		return all.filter(
			(b) =>
				b.title.toLowerCase().includes(q) ||
				(b.author_name ?? "").toLowerCase().includes(q) ||
				b.genres.some((g) => g.toLowerCase().includes(q)),
		);
	});

	const submitAdd = async (book: { foreign_id: string; author_id: number; title: string }) => {
		setAddingId(book.foreign_id);
		setActionError(null);
		try {
			await addBook(book);
			setSearchQuery("");
			setShowSearch(false);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
		}
	};

	return (
		<div>
			<Title>Books · ReadingRoom</Title>
			<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-2xl font-bold">Books</h2>
				<div class="flex flex-wrap items-center gap-2">
					<ViewToggle view={view()} onChange={(v) => setView(v)} />
					<button
						onClick={() => setShowSearch(!showSearch())}
						class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-indigo-500"
					>
						{showSearch() ? "Cancel" : "Add Book"}
					</button>
				</div>
			</div>

			<Show when={showSearch()}>
				<div class="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-4">
					<input
						type="text"
						placeholder="Search for a book by title..."
						value={searchQuery()}
						onInput={(e) => setSearchQuery(e.currentTarget.value)}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-gray-100 placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
						autofocus
					/>

					<Show when={searchQuery().trim()}>
						<Errored
							fallback={(err, reset) => (
								<p class="mt-2 text-sm text-red-400">
									Search failed: {String(err())}{" "}
									<button
										onClick={reset}
										class="ml-1 text-indigo-400 underline hover:text-indigo-300"
									>
										Retry
									</button>
								</p>
							)}
						>
							<Loading fallback={<p class="text-sm text-gray-500">Searching...</p>}>
								<Show
									when={searchResults().books.length > 0}
									fallback={
										<p class="mt-4 text-sm text-gray-500">No books found.</p>
									}
								>
									<div class="mt-4 space-y-2">
										<For each={searchResults().books}>
											{(book) => (
												<div class="flex items-center gap-4 rounded-lg bg-gray-800 p-3 transition-colors hover:bg-gray-700">
													<Show when={book.image_url}>
														{(img) => (
															<img
																src={img()}
																alt={book.title}
																class="h-14 w-10 rounded object-cover"
															/>
														)}
													</Show>
													<div class="min-w-0 flex-1">
														<p class="truncate font-medium">
															{book.title}
														</p>
														<p class="truncate text-xs text-gray-400">
															{book.publish_date &&
																`${book.publish_date}`}
															{book.genres.length > 0 &&
																` · ${book.genres.slice(0, 3).join(", ")}`}
															{book.language && ` · ${book.language}`}
														</p>
													</div>
													<button
														onClick={() =>
															void submitAdd({
																foreign_id: book.foreign_id,
																author_id: book.author_id,
																title: book.title,
															})
														}
														disabled={addingId() === book.foreign_id}
														class="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-indigo-500 disabled:bg-gray-600"
													>
														{addingId() === book.foreign_id
															? "Adding..."
															: "Add"}
													</button>
												</div>
											)}
										</For>
									</div>
								</Show>
							</Loading>
						</Errored>
					</Show>

					<Show when={actionError()}>
						<p class="mt-2 text-sm text-red-400">{actionError()}</p>
					</Show>
				</div>
			</Show>

			<Errored
				fallback={(err, reset) => (
					<p class="mt-2 text-sm text-red-400">
						Failed to load books: {String(err())}{" "}
						<button
							onClick={reset}
							class="ml-1 text-indigo-400 underline hover:text-indigo-300"
						>
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-gray-500">Loading books...</p>}>
					<div class="mb-4">
						<input
							type="text"
							placeholder="Filter tracked books by title or author..."
							value={filterQuery()}
							onInput={(e) => setSearch({ q: e.currentTarget.value })}
							class="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-gray-100 placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-indigo-500 focus:outline-hidden sm:w-72"
						/>
					</div>
					<Show
						when={books.books.length > 0}
						fallback={
							<div class="py-12 text-center text-gray-500">
								<p class="text-lg">No books tracked yet.</p>
								<p class="mt-2 text-sm">
									Click "Add Book" to search and start tracking.
								</p>
							</div>
						}
					>
						<Show
							when={filteredBooks().length > 0}
							fallback={
								<div class="py-12 text-center text-gray-500">
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
													href={paths.books(bookId(book))}
													cardLink
													coverSrc={book.image_url}
													title={book.title}
													subtitle={listSubtitle(book)}
													status={book.status}
												/>
											)}
										</For>
									</div>
								}
							>
								<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
									<For each={filteredBooks()}>
										{(book) => (
											<BookCard
												href={paths.books(bookId(book))}
												cardLink
												coverSrc={book.image_url}
												title={book.title}
												subtitle={
													book.author_name ||
													book.genres.slice(0, 2).join(", ") ||
													"No author"
												}
												status={book.status}
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
