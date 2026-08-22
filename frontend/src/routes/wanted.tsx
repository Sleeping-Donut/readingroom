import { Title } from "@solidjs/meta";
import { revalidate } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { action, createMemo, createSignal, Errored, For, Loading, Show } from "solid-js";

import { bookId } from "../api/books";
import { getWanted, searchWantedAll, searchWantedBook } from "../api/wanted";
import { StatusBadge } from "../components/books/StatusBadge";
import { paths } from "../router";

export const route = defineFileRoute("/wanted", {
	preload: () => {
		void getWanted();
	},
});

export default function Wanted() {
	const wanted = createMemo(() => getWanted());
	const [searchingAll, setSearchingAll] = createSignal(false);
	const [searchingBookId, setSearchingBookId] = createSignal<number | null>(null);
	const [actionError, setActionError] = createSignal<string | null>(null);

	const searchAll = action(async function* () {
		setSearchingAll(true);
		setActionError(null);
		try {
			await searchWantedAll();
			yield;
			revalidate(getWanted.key);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
		} finally {
			setSearchingAll(false);
		}
	});

	const searchBook = action(async function* (id: number) {
		setSearchingBookId(id);
		setActionError(null);
		try {
			await searchWantedBook(id);
			yield;
			revalidate(getWanted.key);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
		} finally {
			setSearchingBookId(null);
		}
	});

	return (
		<div>
			<Title>Wanted · ReadingRoom</Title>
			<div class="mb-6 flex items-center justify-between">
				<div>
					<p class="font-meta text-xs tracking-widest text-ink-500 uppercase">
						Missing from the Shelves
					</p>
					<h2 class="font-display text-4xl text-ink-900">Wanted</h2>
				</div>
				<button
					onClick={() => void searchAll()}
					disabled={searchingAll()}
					class="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
				>
					{searchingAll() ? "Searching..." : "Search All"}
				</button>
			</div>

			<Show when={actionError()}>
				<p class="mb-4 text-sm text-bad">{actionError()}</p>
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
				<Loading fallback={<p class="text-ink-500">Loading...</p>}>
					<>
						<span class="mb-6 block text-sm text-ink-700">
							{wanted().total} missing
						</span>
						<Show
							when={wanted().books.length > 0}
							fallback={
								<div class="py-12 text-center text-ink-500">
									<p class="text-lg">All monitored books have files.</p>
									<p class="mt-2 text-sm">No missing books to search for.</p>
								</div>
							}
						>
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
								<For each={wanted().books}>
									{(book) => (
										<div class="group relative rounded-sm border border-rule bg-paper-100 p-4">
											<span class="absolute top-2 right-2 rounded bg-pending px-2 py-0.5 text-xs font-medium text-pending">
												Wanted
											</span>
											<a
												href={paths.books(bookId(book))}
												class="block transition-colors hover:border-ink-900"
											>
												<Show when={book.image_url}>
													{(img) => (
														<img
															src={img()}
															alt={book.title}
															class="mb-3 h-48 w-full rounded object-cover"
														/>
													)}
												</Show>
												<p class="truncate font-medium">{book.title}</p>
												<div class="mt-1.5">
													<StatusBadge status={book.status} />
												</div>
												<p class="mt-1 text-xs text-ink-700">
													{book.genres.length > 0
														? book.genres.slice(0, 2).join(", ")
														: "No genres"}
												</p>
											</a>
											<button
												onClick={() => void searchBook(book.id)}
												disabled={searchingBookId() === book.id}
												class="mt-3 w-full rounded bg-ink-900 px-3 py-1.5 text-xs font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:bg-paper-200"
											>
												{searchingBookId() === book.id
													? "Searching..."
													: "Search & Download"}
											</button>
										</div>
									)}
								</For>
							</div>
						</Show>
					</>
				</Loading>
			</Errored>
		</div>
	);
}
