import { Show, Switch, Match } from "solid-js";

import type { IndexerRow } from "../../resources/indexers";

import StatusDot from "./StatusDot";

/// Display card for one configured indexer.
export function IndexerCard(props: {
	idx: IndexerRow;
	implLabel: string;
	onTest: () => void;
	onEdit: () => void;
	onRemove: () => void;
	onRetry: () => void;
}) {
	return (
		<div
			class={[
				"flex flex-col gap-3 rounded-lg border bg-gray-900 p-3 transition-colors sm:flex-row sm:items-center",
				{ "border-red-800": !!props.idx.error, "border-gray-800": !props.idx.error },
			]}
		>
			<StatusDot status={props.idx.test?.status ?? "idle"} />
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">{props.idx.name}</p>
				<div class="mt-1 flex flex-wrap gap-1.5">
					<span class="rounded border border-indigo-800 bg-indigo-900/40 px-1.5 py-0.5 text-xs text-indigo-400">
						{props.implLabel}
					</span>
					<Show when={props.idx.enable_rss}>
						<span class="rounded border border-green-800 bg-green-900/40 px-1.5 py-0.5 text-xs text-green-400">
							RSS
						</span>
					</Show>
					<Show when={props.idx.enable_search}>
						<span class="rounded border border-green-800 bg-green-900/40 px-1.5 py-0.5 text-xs text-green-400">
							Search
						</span>
					</Show>
					<Show when={!props.idx.enable_rss && !props.idx.enable_search}>
						<span class="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">
							Disabled
						</span>
					</Show>
					<Show when={props.idx.priority !== 0}>
						<span class="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">
							Priority: {props.idx.priority}
						</span>
					</Show>
				</div>
				<Show when={props.idx.test}>
					<Switch>
						<Match when={props.idx.test?.status === "success"}>
							<p class="mt-1 text-xs text-green-400">✓ {props.idx.test?.message}</p>
						</Match>
						<Match when={props.idx.test?.status === "error"}>
							<p class="mt-1 text-xs text-red-400">✗ {props.idx.test?.message}</p>
						</Match>
					</Switch>
				</Show>
				<Show when={props.idx.error}>
					<p class="mt-1 text-xs text-red-400">Failed to remove — click Retry</p>
				</Show>
			</div>
			<div class="flex shrink-0 flex-wrap gap-2">
				<button
					onClick={props.onTest}
					disabled={props.idx.test?.status === "testing"}
					class="rounded bg-indigo-700 px-2 py-1 text-xs transition-colors hover:bg-indigo-600"
				>
					{props.idx.test?.status === "testing" ? "Testing..." : "Test"}
				</button>
				<button
					onClick={props.onEdit}
					class="rounded bg-indigo-700 px-2 py-1 text-xs transition-colors hover:bg-indigo-600"
				>
					Edit
				</button>
				<Show
					when={props.idx.error}
					fallback={
						<button
							onClick={props.onRemove}
							class="rounded bg-red-700 px-2 py-1 text-xs transition-colors hover:bg-red-600"
						>
							Remove
						</button>
					}
				>
					<button
						onClick={props.onRetry}
						disabled={props.idx.pending}
						class="rounded bg-indigo-700 px-2 py-1 text-xs transition-colors hover:bg-indigo-600 disabled:bg-gray-700"
					>
						{props.idx.pending ? "Retrying..." : "Retry"}
					</button>
				</Show>
			</div>
		</div>
	);
}
