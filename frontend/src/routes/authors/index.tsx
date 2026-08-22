import { Title } from "@solidjs/meta";
import { useSearchParams, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";
import * as v from "valibot";

import type { Author } from "../../types";

import { authorId, getAuthors, searchAuthors } from "../../api/authors";
import { AuthorCard } from "../../components/authors/AuthorCard";
import { AuthorRow } from "../../components/authors/AuthorRow";
import { createViewPreference, ViewToggle } from "../../components/ViewToggle";
import { createAuthors } from "../../resources/authors";
import { paths } from "../../router";

export const route = defineFileRoute("/authors", {
	search: v.object({ q: v.optional(v.string()) }),
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

export default function Authors(_props: RouteProps<typeof route>) {
	const [searchQuery, setSearchQuery] = createSignal("");
	const [showSearch, setShowSearch] = createSignal(false);
	const [addingId, setAddingId] = createSignal<string | null>(null);
	const [actionError, setActionError] = createSignal<string | null>(null);
	const [view, setView] = createViewPreference("authors");
	const [search, setSearch] = useSearchParams(paths.authors);

	const filterQuery = () => search.q ?? "";

	const [authors, { addAuthor: addAuthorToLibrary }] = createAuthors();

	// Empty result (not null) while the query is empty; the JSX gates "idle"
	// on the query so an open panel doesn't read as "no matches".
	const EMPTY_SEARCH = { authors: [] as Author[], total: 0 };
	const searchResults = createMemo(async () => {
		const q = searchQuery();
		if (q.length === 0) return EMPTY_SEARCH;
		return searchAuthors(q);
	});

	const filtered = createMemo(() => {
		const q = filterQuery().trim().toLowerCase();
		const all = authors.authors;
		if (!q) return all;
		return all.filter((author) => matchesFilter(author, q));
	});

	const submitAdd = async (author: { foreign_id: string; name: string }) => {
		setAddingId(author.foreign_id);
		setActionError(null);
		try {
			await addAuthorToLibrary(author);
			setSearchQuery("");
			setShowSearch(false);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
		}
	};

	return (
		<div>
			<Title>Authors · ReadingRoom</Title>
			<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-2xl font-bold">Authors</h2>
				<div class="flex flex-wrap items-center gap-2">
					<ViewToggle view={view()} onChange={(v) => setView(v)} />
					<button
						onClick={() => setShowSearch(!showSearch())}
						class="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700"
					>
						{showSearch() ? "Cancel" : "Add Author"}
					</button>
				</div>
			</div>

			<Show when={showSearch()}>
				<div class="mb-6 rounded-lg border border-rule bg-paper-100 p-4">
					<input
						type="text"
						placeholder="Search for an author by name..."
						value={searchQuery()}
						onInput={(e) => setSearchQuery(e.currentTarget.value)}
						class="w-full rounded-lg border border-rule bg-paper-200 px-4 py-2 text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-hidden"
						autofocus
					/>

					<Show when={searchQuery().trim()}>
						<Errored
							fallback={(err, reset) => (
								<p class="mt-2 text-sm text-bad">
									Search failed: {String(err())}{" "}
									<button
										onClick={reset}
										class="ml-1 text-accent underline hover:text-accent"
									>
										Retry
									</button>
								</p>
							)}
						>
							<Loading fallback={<p class="text-ink-500">Loading...</p>}>
								<Show
									when={searchResults().authors.length > 0}
									fallback={
										<p class="mt-4 text-sm text-ink-500">No authors found.</p>
									}
								>
									<div class="mt-4 space-y-2">
										<For each={searchResults().authors}>
											{(author) => (
												<div class="flex items-center gap-4 rounded-lg bg-paper-200 p-3 transition-colors hover:bg-paper-200">
													<Show when={author.image_url}>
														{(img) => (
															<img
																src={img()}
																alt={author.name}
																class="h-14 w-10 rounded object-cover"
															/>
														)}
													</Show>
													<div class="min-w-0 flex-1">
														<p class="truncate font-medium">
															{author.name}
														</p>
														<p class="truncate text-xs text-ink-700">
															{author.birth_date &&
																`${author.birth_date}`}
															{author.birth_date &&
																author.death_date &&
																" – "}
															{author.death_date &&
																`${author.death_date}`}
															{author.genres.length > 0 &&
																` · ${author.genres.slice(0, 3).join(", ")}`}
														</p>
													</div>
													<button
														onClick={() =>
															void submitAdd({
																foreign_id: author.foreign_id,
																name: author.name,
															})
														}
														disabled={addingId() === author.foreign_id}
														class="rounded bg-ink-900 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-ink-700 disabled:opacity-50"
													>
														{addingId() === author.foreign_id
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
						Failed to load authors: {String(err())}{" "}
						<button
							onClick={reset}
							class="ml-1 text-accent underline hover:text-accent"
						>
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-ink-500">Loading...</p>}>
					<Show
						when={authors.authors.length > 0}
						fallback={
							<div class="py-12 text-center text-ink-500">
								<p class="text-lg">No authors tracked yet.</p>
								<p class="mt-2 text-sm">
									Click "Add Author" to search and start tracking.
								</p>
							</div>
						}
					>
						<div class="mb-4">
							<input
								type="text"
								placeholder="Filter authors by name, alias, or genre..."
								value={filterQuery()}
								onInput={(e) => setSearch({ q: e.currentTarget.value })}
								class="w-full max-w-md rounded-lg border border-rule bg-paper-200 px-4 py-2 text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-hidden"
							/>
						</div>

						<Show
							when={filtered().length > 0}
							fallback={
								<div class="py-12 text-center text-ink-500">
									<p class="text-lg">
										No authors match "{filterQuery().trim()}".
									</p>
									<p class="mt-2 text-sm">
										Try a different name, alias, or genre.
									</p>
								</div>
							}
						>
							<Show when={filterQuery().trim().length > 0}>
								<p class="mb-3 text-sm text-ink-700">
									Showing {filtered().length} of {authors.authors.length} authors
								</p>
							</Show>

							<Show
								when={view() === "grid"}
								fallback={
									<div class="space-y-2">
										<For each={filtered()}>
											{(author) => (
												<AuthorRow
													href={paths.authors(authorId(author))}
													imageUrl={author.image_url}
													name={author.name}
													subtitle={rowSubtitle(author)}
												/>
											)}
										</For>
									</div>
								}
							>
								<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
									<For each={filtered()}>
										{(author) => (
											<AuthorCard
												href={paths.authors(authorId(author))}
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
