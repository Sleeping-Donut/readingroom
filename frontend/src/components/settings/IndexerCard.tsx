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
				"flex flex-col gap-3 rounded-lg border bg-paper-100 p-3 transition-colors sm:flex-row sm:items-center",
				{ "border-bad/30": !!props.idx.error, "border-rule": !props.idx.error },
			]}
		>
			<StatusDot status={props.idx.test?.status ?? "idle"} />
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">{props.idx.name}</p>
				<div class="mt-1 flex flex-wrap gap-1.5">
					<span class="rounded border border-accent/30 bg-accent-wash px-1.5 py-0.5 text-xs text-accent">
						{props.implLabel}
					</span>
					<Show when={props.idx.enable_rss}>
						<span class="rounded border border-good/30 bg-good/10 px-1.5 py-0.5 text-xs text-good">
							RSS
						</span>
					</Show>
					<Show when={props.idx.enable_search}>
						<span class="rounded border border-good/30 bg-good/10 px-1.5 py-0.5 text-xs text-good">
							Search
						</span>
					</Show>
					<Show when={!props.idx.enable_rss && !props.idx.enable_search}>
						<span class="rounded border border-rule bg-paper-200 px-1.5 py-0.5 text-xs text-ink-500">
							Disabled
						</span>
					</Show>
					<Show when={props.idx.priority !== 0}>
						<span class="rounded border border-rule bg-paper-200 px-1.5 py-0.5 text-xs text-ink-700">
							Priority: {props.idx.priority}
						</span>
					</Show>
				</div>
				<Show when={props.idx.test}>
					<Switch>
						<Match when={props.idx.test?.status === "success"}>
							<p class="mt-1 text-xs text-good">✓ {props.idx.test?.message}</p>
						</Match>
						<Match when={props.idx.test?.status === "error"}>
							<p class="mt-1 text-xs text-bad">✗ {props.idx.test?.message}</p>
						</Match>
					</Switch>
				</Show>
				<Show when={props.idx.error}>
					<p class="mt-1 text-xs text-bad">Failed to remove — click Retry</p>
				</Show>
			</div>
			<div class="flex shrink-0 flex-wrap gap-2">
				<button
					onClick={props.onTest}
					disabled={props.idx.test?.status === "testing"}
					class="rounded bg-ink-900 px-2 py-1 text-xs transition-colors hover:bg-ink-900"
				>
					{props.idx.test?.status === "testing" ? "Testing..." : "Test"}
				</button>
				<button
					onClick={props.onEdit}
					class="rounded bg-ink-900 px-2 py-1 text-xs transition-colors hover:bg-ink-900"
				>
					Edit
				</button>
				<Show
					when={props.idx.error}
					fallback={
						<button
							onClick={props.onRemove}
							class="rounded bg-bad px-2 py-1 text-xs transition-colors hover:opacity-90"
						>
							Remove
						</button>
					}
				>
					<button
						onClick={props.onRetry}
						disabled={props.idx.pending}
						class="rounded bg-ink-900 px-2 py-1 text-xs transition-colors hover:bg-ink-900 disabled:bg-paper-200"
					>
						{props.idx.pending ? "Retrying..." : "Retry"}
					</button>
				</Show>
			</div>
		</div>
	);
}
