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
			<div class="gap-3 mb-6 flex flex-wrap items-center justify-between">
				<h2 class="text-2xl font-bold">Books</h2>
				<div class="gap-2 flex flex-wrap items-center">
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
				<div class="mb-6 p-4 bg-gray-900 rounded-lg border-gray-800 border">
					<input
						type="text"
						placeholder="Search for a book by title..."
						value={searchQuery()}
						onInput={(e) => setSearchQuery(e.currentTarget.value)}
						class="px-4 py-2 bg-gray-800 border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-indigo-500 w-full border focus:border-transparent focus:ring-2 focus:outline-none"
						autofocus
					/>

					<Show when={searchQuery().trim()}>
						<Errored
							fallback={(err, reset) => (
								<p class="text-sm text-red-400 mt-2">
									Search failed: {String(err())}{" "}
									<button
										onClick={reset}
										class="text-indigo-400 hover:text-indigo-300 ml-1 underline"
									>
										Retry
									</button>
								</p>
							)}
						>
							<Loading fallback={<p class="text-gray-500 text-sm">Searching...</p>}>
								<Show
									when={searchResults().books.length > 0}
									fallback={
										<p class="mt-4 text-gray-500 text-sm">No books found.</p>
									}
								>
									<div class="mt-4 space-y-2">
										<For each={searchResults().books}>
											{(book) => (
												<div class="gap-4 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 flex items-center transition-colors">
													<Show when={book.image_url}>
														{(img) => (
															<img
																src={img()}
																alt={book.title}
																class="w-10 h-14 rounded object-cover"
															/>
														)}
													</Show>
													<div class="min-w-0 flex-1">
														<p class="font-medium truncate">
															{book.title}
														</p>
														<p class="text-xs text-gray-400 truncate">
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
														class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded text-xs font-medium transition-colors"
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
						<p class="text-sm text-red-400 mt-2">{actionError()}</p>
					</Show>
				</div>
			</Show>

			<Errored
				fallback={(err, reset) => (
					<p class="text-sm text-red-400 mt-2">
						Failed to load books: {String(err())}{" "}
						<button
							onClick={reset}
							class="text-indigo-400 hover:text-indigo-300 ml-1 underline"
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
							class="sm:w-72 px-4 py-2 bg-gray-800 border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-indigo-500 w-full border focus:border-transparent focus:ring-2 focus:outline-none"
						/>
					</div>
					<Show
						when={books.books.length > 0}
						fallback={
							<div class="py-12 text-gray-500 text-center">
								<p class="text-lg">No books tracked yet.</p>
								<p class="text-sm mt-2">
									Click "Add Book" to search and start tracking.
								</p>
							</div>
						}
					>
						<Show
							when={filteredBooks().length > 0}
							fallback={
								<div class="py-12 text-gray-500 text-center">
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
								<div class="sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 grid grid-cols-2">
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
