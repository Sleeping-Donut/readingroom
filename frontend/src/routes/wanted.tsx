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
						<button onClick={reset} class="text-indigo-400 ml-1 underline">
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-gray-500">Loading...</p>}>
					<>
						<span class="text-sm text-gray-400 mb-6 block">
							{wanted().total} missing
						</span>
						<Show
							when={wanted().books.length > 0}
							fallback={
								<div class="py-12 text-gray-500 text-center">
									<p class="text-lg">All monitored books have files.</p>
									<p class="text-sm mt-2">No missing books to search for.</p>
								</div>
							}
						>
							<div class="sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 grid grid-cols-1">
								<For each={wanted().books}>
									{(book) => (
										<div class="p-4 bg-gray-900 rounded-lg border-gray-800 group relative border">
											<span class="top-2 right-2 text-xs font-medium px-2 py-0.5 rounded bg-yellow-700 text-yellow-200 absolute">
												Wanted
											</span>
											<a
												href={paths.books(bookId(book))}
												class="hover:border-indigo-600 block transition-colors"
											>
												<Show when={book.image_url}>
													{(img) => (
														<img
															src={img()}
															alt={book.title}
															class="h-48 rounded mb-3 w-full object-cover"
														/>
													)}
												</Show>
												<p class="font-medium truncate">{book.title}</p>
												<div class="mt-1.5">
													<StatusBadge status={book.status} />
												</div>
												<p class="text-xs text-gray-400 mt-1">
													{book.genres.length > 0
														? book.genres.slice(0, 2).join(", ")
														: "No genres"}
												</p>
											</a>
											<button
												onClick={() => void searchBook(book.id)}
												disabled={searchingBookId() === book.id}
												class="mt-3 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 rounded text-xs font-medium w-full transition-colors"
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
