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
        "flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-900 rounded-lg border transition-colors",
        { "border-red-800": !!props.idx.error, "border-gray-800": !props.idx.error },
      ]}
    >
      <StatusDot status={props.idx.test?.status ?? "idle"} />
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">{props.idx.name}</p>
        <div class="flex flex-wrap gap-1.5 mt-1">
          <span class="text-xs bg-indigo-900/40 text-indigo-400 border border-indigo-800 rounded px-1.5 py-0.5">
            {props.implLabel}
          </span>
          <Show when={props.idx.enable_rss}>
            <span class="text-xs bg-green-900/40 text-green-400 border border-green-800 rounded px-1.5 py-0.5">
              RSS
            </span>
          </Show>
          <Show when={props.idx.enable_search}>
            <span class="text-xs bg-green-900/40 text-green-400 border border-green-800 rounded px-1.5 py-0.5">
              Search
            </span>
          </Show>
          <Show when={!props.idx.enable_rss && !props.idx.enable_search}>
            <span class="text-xs bg-gray-800 text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">
              Disabled
            </span>
          </Show>
          <Show when={props.idx.priority !== 0}>
            <span class="text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded px-1.5 py-0.5">
              Priority: {props.idx.priority}
            </span>
          </Show>
        </div>
        <Show when={props.idx.test}>
          <Switch>
            <Match when={props.idx.test?.status === "success"}>
              <p class="text-xs text-green-400 mt-1">✓ {props.idx.test?.message}</p>
            </Match>
            <Match when={props.idx.test?.status === "error"}>
              <p class="text-xs text-red-400 mt-1">✗ {props.idx.test?.message}</p>
            </Match>
          </Switch>
        </Show>
        <Show when={props.idx.error}>
          <p class="text-xs text-red-400 mt-1">Failed to remove — click Retry</p>
        </Show>
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <button
          onClick={props.onTest}
          disabled={props.idx.test?.status === "testing"}
          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
        >
          {props.idx.test?.status === "testing" ? "Testing..." : "Test"}
        </button>
        <button
          onClick={props.onEdit}
          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
        >
          Edit
        </button>
        <Show
          when={props.idx.error}
          fallback={
            <button
              onClick={props.onRemove}
              class="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
            >
              Remove
            </button>
          }
        >
          <button
            onClick={props.onRetry}
            disabled={props.idx.pending}
            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
          >
            {props.idx.pending ? "Retrying..." : "Retry"}
          </button>
        </Show>
      </div>
    </div>
  );
}
