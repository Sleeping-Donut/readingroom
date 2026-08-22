import { Title } from "@solidjs/meta";
import { revalidate } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { Errored, For, Loading, Show, onSettled } from "solid-js";

import { getQueue } from "../api/queue";
import { subscribeAll } from "../api/ws";
import { createQueue } from "../resources/queue";

export const route = defineFileRoute("/queue", {
	preload: () => {
		void getQueue();
	},
});

const statusColor = (status: string) => {
	switch (status) {
		case "downloading":
			return "text-blue-400";
		case "completed":
			return "text-green-400";
		case "failed":
			return "text-red-400";
		case "queued":
			return "text-yellow-400";
		case "seeding":
			return "text-purple-400";
		default:
			return "text-gray-400";
	}
};

export default function Queue() {
	const [queue, { remove, retryRemove }] = createQueue();

	// WS push is the primary update source; keep a slow poll as a fallback in
	// case WS drops. Revalidating the query retriggers the store's source.
	onSettled(() => {
		const pollId = setInterval(() => revalidate(getQueue.key), 30000);
		const unsub = subscribeAll(() => revalidate(getQueue.key));
		return () => {
			clearInterval(pollId);
			unsub();
		};
	});

	return (
		<div>
			<Title>Queue · ReadingRoom</Title>
			<h2 class="mb-6 text-2xl font-bold">Download Queue</h2>

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
						when={queue.queue.length > 0}
						fallback={
							<div class="py-12 text-center text-gray-500">
								<p class="text-lg">No active downloads.</p>
								<p class="mt-2 text-sm">
									Search for books and start a download to see it here.
								</p>
							</div>
						}
					>
						<div class="space-y-3">
							<For each={queue.queue}>
								{(entry) => (
									<div
										class={[
											"flex items-center gap-4 rounded-lg border bg-gray-900 p-4 transition-colors",
											{
												"border-red-800": !!entry.error,
												"border-gray-800": !entry.error,
											},
										]}
									>
										<div class="min-w-0 flex-1">
											<p class="truncate font-medium">{entry.title}</p>
											<p class="mt-1 text-xs text-gray-400">
												{entry.download_client} &middot; {entry.status}
												{entry.size
													? ` \u00b7 ${(entry.size / 1_000_000).toFixed(1)} MB`
													: ""}
											</p>
											<Show
												when={
													entry.status === "downloading" &&
													entry.progress > 0
												}
											>
												<div class="mt-2 h-1.5 w-full rounded-full bg-gray-800">
													<div
														class="h-1.5 rounded-full bg-indigo-500 transition-all"
														style={{
															width: `${Math.round(entry.progress * 100)}%`,
														}}
													/>
												</div>
											</Show>
											<Show when={entry.error}>
												<p class="mt-1 text-xs text-red-400">
													Failed to remove — click Retry
												</p>
											</Show>
										</div>
										<span
											class={[
												"text-xs font-medium",
												{ [statusColor(entry.status)]: true },
											]}
										>
											{entry.status}
										</span>
										<Show
											when={entry.error}
											fallback={
												<button
													onClick={() => void remove(entry)}
													class="rounded bg-red-700 px-2 py-1 text-xs transition-colors hover:bg-red-600"
												>
													Remove
												</button>
											}
										>
											<button
												onClick={() => void retryRemove(entry.id)}
												disabled={entry.pending}
												class="rounded bg-indigo-700 px-2 py-1 text-xs transition-colors hover:bg-indigo-600 disabled:bg-gray-700"
											>
												{entry.pending ? "Retrying..." : "Retry"}
											</button>
										</Show>
									</div>
								)}
							</For>
						</div>
					</Show>
				</Loading>
			</Errored>
		</div>
	);
}
