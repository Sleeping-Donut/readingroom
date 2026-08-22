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
			<h2 class="text-2xl font-bold mb-6">Activity</h2>

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
					<Show
						when={history().history.length > 0}
						fallback={
							<div class="py-12 text-gray-500 text-center">
								<p class="text-lg">No history yet.</p>
								<p class="text-sm mt-2">
									Download and import activity will appear here.
								</p>
							</div>
						}
					>
						<div class="overflow-x-auto">
							<table class="text-sm w-full">
								<thead>
									<tr class="text-gray-400 border-gray-800 border-b text-left">
										<th class="pb-3 pr-4">Event</th>
										<th class="pb-3 pr-4">Title</th>
										<th class="pb-3 pr-4">Details</th>
										<th class="pb-3 pr-4">Date</th>
									</tr>
								</thead>
								<tbody>
									<For each={history().history}>
										{(item) => (
											<tr class="border-gray-800/50 hover:bg-gray-900/50 border-b">
												<td class="py-3 pr-4">
													<span class="text-xs font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-300">
														{item.event_type}
													</span>
												</td>
												<td class="py-3 pr-4 text-gray-200 max-w-xs truncate">
													{item.source_title || "-"}
												</td>
												<td class="py-3 pr-4 text-gray-400">
													<Show when={item.indexer}>
														<span>{item.indexer}</span>
													</Show>
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
												<td class="py-3 pr-4 text-gray-400 whitespace-nowrap">
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
