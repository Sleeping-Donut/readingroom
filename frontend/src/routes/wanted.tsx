import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Title } from "@solidjs/meta";
import { revalidate } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
	action,
	createMemo,
	createOptimistic,
	createSignal,
	Errored,
	For,
	Loading,
	Show,
} from "solid-js";

import type { MediaType } from "../types";

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
	const [searchingAll, setSearchingAll] = createOptimistic(false);
	const [searchingBookId, setSearchingBookId] = createOptimistic<number | null>(null);
	const [actionError, setActionError] = createSignal<string | null>(null);

	const searchAll = action(async function* (media?: MediaType) {
		setSearchingAll(true);
		setActionError(null);
		try {
			await searchWantedAll(media);
			yield;
			revalidate(getWanted.key);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Request failed");
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
				<div class="flex">
					<button
						onClick={() => void searchAll()}
						disabled={searchingAll()}
						class="rounded-l-lg bg-ink-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
					>
						{searchingAll() ? "Searching..." : "Search All"}
					</button>
					<DropdownMenu>
						<DropdownMenu.Trigger
							disabled={searchingAll()}
							aria-label="Search options"
							class="rounded-r-lg border-l border-paper-50/20 bg-ink-900 px-2 py-2 text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
							>
								<path
									fill-rule="evenodd"
									d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
									clip-rule="evenodd"
								/>
							</svg>
						</DropdownMenu.Trigger>
						<DropdownMenu.Portal>
							<DropdownMenu.Content class="z-50 min-w-44 rounded-sm border border-rule bg-paper-50 p-1 shadow-md">
								<DropdownMenu.Item
									onSelect={() => void searchAll("ebook")}
									class="cursor-pointer rounded px-3 py-1.5 text-sm text-ink-900 outline-hidden data-[highlighted]:bg-paper-200"
								>
									Books only
								</DropdownMenu.Item>
								<DropdownMenu.Item
									onSelect={() => void searchAll("audiobook")}
									class="cursor-pointer rounded px-3 py-1.5 text-sm text-ink-900 outline-hidden data-[highlighted]:bg-paper-200"
								>
									Audiobooks only
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Portal>
					</DropdownMenu>
				</div>
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
