import { Title } from "@solidjs/meta";
import { revalidate } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { Errored, For, Loading, Show, onSettled } from "solid-js";

import { getQueue } from "../api/queue";
import { subscribeAll } from "../api/ws";
import { Specimen } from "../components/ui/Specimen";
import { createQueue } from "../resources/queue";

export const route = defineFileRoute("/queue", {
	preload: () => {
		void getQueue();
	},
});

const statusColor = (status: string) => {
	switch (status) {
		case "downloading":
			return "text-pending";
		case "completed":
			return "text-good";
		case "failed":
			return "text-bad";
		case "queued":
			return "text-pending";
		case "seeding":
			return "text-ink-500";
		default:
			return "text-ink-700";
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
			<div class="mb-8">
				<p class="font-meta text-xs tracking-widest text-ink-500 uppercase">In Flight</p>
				<h2 class="font-display text-4xl text-ink-900">Queue</h2>
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
					<Show
						when={queue.queue.length > 0}
						fallback={
							<Specimen
								label="In Flight"
								detail="Search for books and start a download to see it here."
							>
								No active downloads.
							</Specimen>
						}
					>
						<div class="divide-y divide-rule border-y border-rule">
							<For each={queue.queue}>
								{(entry) => (
									<div
										class={[
											"flex items-center gap-4 py-4 transition-colors",
											{ "bg-bad/5": !!entry.error },
										]}
									>
										<div class="min-w-0 flex-1">
											<p class="truncate font-medium">{entry.title}</p>
											<p class="mt-1 text-xs text-ink-700">
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
												<div class="mt-2 h-1.5 w-full rounded-full bg-paper-200">
													<div
														class="h-1.5 rounded-full bg-accent transition-all"
														style={{
															width: `${Math.round(entry.progress * 100)}%`,
														}}
													/>
												</div>
											</Show>
											<Show when={entry.error}>
												<p class="mt-1 text-xs text-bad">
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
													class="rounded bg-bad px-2 py-1 text-xs transition-colors hover:opacity-90"
												>
													Remove
												</button>
											}
										>
											<button
												onClick={() => void retryRemove(entry.id)}
												disabled={entry.pending}
												class="rounded bg-ink-900 px-2 py-1 text-xs text-paper-50 transition-colors hover:bg-ink-700 disabled:bg-paper-200"
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
