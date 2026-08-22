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
					<p class="mt-2 text-sm text-red-400">
						Failed to load: {String(err())}{" "}
						<button onClick={reset} class="ml-1 text-indigo-400 underline">
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-gray-500">Loading...</p>}>
					<Show
						when={history().history.length > 0}
						fallback={
							<div class="py-12 text-center text-gray-500">
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
									<tr class="border-b border-gray-800 text-left text-gray-400">
										<th class="pr-4 pb-3">Event</th>
										<th class="pr-4 pb-3">Title</th>
										<th class="pr-4 pb-3">Details</th>
										<th class="pr-4 pb-3">Date</th>
									</tr>
								</thead>
								<tbody>
									<For each={history().history}>
										{(item) => (
											<tr class="border-b border-gray-800/50 hover:bg-gray-900/50">
												<td class="py-3 pr-4">
													<span class="rounded bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-300">
														{item.event_type}
													</span>
												</td>
												<td class="max-w-xs truncate py-3 pr-4 text-gray-200">
													{item.source_title || "-"}
												</td>
												<td class="py-3 pr-4 text-gray-400">
													{item.indexer ? (
														<span>{item.indexer}</span>
													) : (
														<span>-</span>
													)}
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
												<td class="py-3 pr-4 whitespace-nowrap text-gray-400">
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
