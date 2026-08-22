import { Title } from "@solidjs/meta";
import { useSearchParams, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";
import * as v from "valibot";

import type { Book } from "../../types";

import { getBooks, bookId, searchBooks } from "../../api/books";
import { BookCard } from "../../components/books/BookCard";
import { BookRow } from "../../components/books/BookRow";
import { Specimen } from "../../components/ui/Specimen";
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
				<div>
					<p class="font-meta text-xs tracking-widest text-ink-500 uppercase">
						The Catalogue
					</p>
					<h2 class="font-display text-4xl text-ink-900">Books</h2>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<ViewToggle view={view()} onChange={(v) => setView(v)} />
					<button
						onClick={() => setShowSearch(!showSearch())}
						class="rounded-sm bg-ink-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700"
					>
						{showSearch() ? "Cancel" : "Add Book"}
					</button>
				</div>
			</div>

			<Show when={showSearch()}>
				<div class="mb-6 rounded-sm border border-dashed border-rule bg-paper-100 p-4">
					<input
						type="text"
						placeholder="Search for a book by title..."
						value={searchQuery()}
						onInput={(e) => setSearchQuery(e.currentTarget.value)}
						class="w-full rounded-sm border border-rule bg-paper-200 px-4 py-2 text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-hidden"
						autofocus
					/>

					<Show when={searchQuery().trim()}>
						<Errored
							fallback={(err, reset) => (
								<p class="mt-2 text-sm text-bad">
									Search failed: {String(err())}{" "}
									<button
										onClick={reset}
										class="ml-1 text-accent underline hover:text-ink-900"
									>
										Retry
									</button>
								</p>
							)}
						>
							<Loading fallback={<p class="text-sm text-ink-500">Searching...</p>}>
								<Show
									when={searchResults().books.length > 0}
									fallback={
										<p class="mt-4 text-sm text-ink-500">No books found.</p>
									}
								>
									<div class="mt-4 space-y-2">
										<For each={searchResults().books}>
											{(book) => (
												<div class="flex items-center gap-4 rounded-sm border border-rule bg-paper-50 p-3 transition-colors hover:bg-paper-200">
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
														<p class="truncate text-xs text-ink-500">
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
														class="rounded-sm bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
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
						<p class="mt-2 text-sm text-bad">{actionError()}</p>
					</Show>
				</div>
			</Show>

			<Errored
				fallback={(err, reset) => (
					<p class="mt-2 text-sm text-bad">
						Failed to load books: {String(err())}{" "}
						<button
							onClick={reset}
							class="ml-1 text-accent underline hover:text-ink-900"
						>
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-ink-500">Loading books...</p>}>
					<div class="mb-4">
						<input
							type="text"
							placeholder="Filter tracked books by title or author..."
							value={filterQuery()}
							onInput={(e) => setSearch({ q: e.currentTarget.value })}
							class="w-full rounded-sm border border-rule bg-paper-200 px-4 py-2 text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-hidden sm:w-72"
						/>
					</div>
					<Show
						when={books.books.length > 0}
						fallback={
							<Specimen
								label="The shelves await"
								detail={'Click "Add Book" to search and start tracking.'}
							>
								No books tracked yet.
							</Specimen>
						}
					>
						<Show
							when={filteredBooks().length > 0}
							fallback={
								<Specimen label="Nothing found">
									No books match your filter.
								</Specimen>
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
