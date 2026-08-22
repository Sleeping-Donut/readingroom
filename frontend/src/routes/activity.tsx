import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, Errored, For, Loading, Show } from "solid-js";

import { getHistory } from "../api/history";

export const route = defineFileRoute("/activity", {
	preload: () => {
		void getHistory();
	},
});

export default function Activity() {
	const history = createMemo(() => getHistory());

	return (
		<div>
			<Title>Activity · ReadingRoom</Title>
			<h2 class="mb-6 text-2xl font-bold">Activity</h2>

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
					<Show
						when={history().history.length > 0}
						fallback={
							<div class="py-12 text-center text-ink-500">
								<p class="text-lg">No history yet.</p>
								<p class="mt-2 text-sm">
									Download and import activity will appear here.
								</p>
							</div>
						}
					>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b border-rule text-left text-ink-700">
										<th class="pr-4 pb-3">Event</th>
										<th class="pr-4 pb-3">Title</th>
										<th class="pr-4 pb-3">Details</th>
										<th class="pr-4 pb-3">Date</th>
									</tr>
								</thead>
								<tbody>
									<For each={history().history}>
										{(item) => (
											<tr class="border-b border-rule hover:bg-paper-200">
												<td class="py-3 pr-4">
													<span class="rounded bg-paper-200 px-2 py-0.5 text-xs font-medium text-ink-900">
														{item.event_type}
													</span>
												</td>
												<td class="max-w-xs truncate py-3 pr-4 text-ink-900">
													{item.source_title || "-"}
												</td>
												<td class="py-3 pr-4 text-ink-700">
													{item.indexer || "-"}
													<Show when={item.download_client}>
														<span> / {item.download_client}</span>
													</Show>
													<Show when={item.size != null}>
														<span>
															{" "}
															· {(item.size! / 1_000_000).toFixed(
																1,
															)}{" "}
															MB
														</span>
													</Show>
												</td>
												<td class="py-3 pr-4 whitespace-nowrap text-ink-700">
													{new Date(item.date).toLocaleDateString()}
												</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
						</div>
					</Show>
				</Loading>
			</Errored>
		</div>
	);
}
