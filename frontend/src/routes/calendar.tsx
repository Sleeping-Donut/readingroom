import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, Errored, For, Loading, Show } from "solid-js";

import { bookId } from "../api/books";
import { getCalendar } from "../api/calendar";
import { paths } from "../router";

export const route = defineFileRoute("/calendar", {
	preload: () => {
		void getCalendar();
	},
});

const monthNames = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

export default function Calendar() {
	const calendar = createMemo(() => getCalendar());

	return (
		<div>
			<Title>Release Calendar · ReadingRoom</Title>
			<div class="mb-8">
				<p class="font-meta text-xs tracking-widest text-ink-500 uppercase">Forthcoming</p>
				<h2 class="font-display text-4xl text-ink-900">Release Calendar</h2>
			</div>

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
					<div>
						<Show
							when={calendar().months.length > 0}
							fallback={
								<div class="py-12 text-center text-ink-500">
									<p class="text-lg">No upcoming releases</p>
									<p class="mt-2 text-sm">
										Books with publish dates will appear here.
									</p>
								</div>
							}
						>
							<For each={calendar().months}>
								{(monthGroup) => (
									<div class="mb-8">
										<h3 class="mb-4 font-display text-xl text-accent italic">
											{monthNames[monthGroup.month - 1]} {monthGroup.year}
										</h3>
										<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
											<For each={monthGroup.books}>
												{(book) => (
													<a
														href={paths.books(bookId(book))}
														class="block rounded-sm border border-rule bg-paper-100 p-4 transition-colors hover:border-ink-900"
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
														<p class="truncate font-medium">
															{book.title}
														</p>
														<p class="mt-1 text-xs text-ink-700">
															{book.publish_date}
														</p>
													</a>
												)}
											</For>
										</div>
									</div>
								)}
							</For>
						</Show>
					</div>
				</Loading>
			</Errored>
		</div>
	);
}
