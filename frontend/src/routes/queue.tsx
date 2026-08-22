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
      <h2 class="text-2xl font-bold mb-6">Download Queue</h2>

      <Errored
        fallback={(err, reset) => (
          <p class="text-sm text-red-400 mt-2">
            Failed to load: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
          <Show
            when={queue.queue.length > 0}
            fallback={
              <div class="text-center py-12 text-gray-500">
                <p class="text-lg">No active downloads.</p>
                <p class="text-sm mt-2">Search for books and start a download to see it here.</p>
              </div>
            }
          >
            <div class="space-y-3">
              <For each={queue.queue}>
                {(entry) => (
                  <div
                    class={[
                      "flex items-center gap-4 p-4 bg-gray-900 rounded-lg border transition-colors",
                      { "border-red-800": !!entry.error, "border-gray-800": !entry.error },
                    ]}
                  >
                    <div class="flex-1 min-w-0">
                      <p class="font-medium truncate">{entry.title}</p>
                      <p class="text-xs text-gray-400 mt-1">
                        {entry.download_client} &middot; {entry.status}
                        {entry.size ? ` \u00b7 ${(entry.size / 1_000_000).toFixed(1)} MB` : ""}
                      </p>
                      <Show when={entry.status === "downloading" && entry.progress > 0}>
                        <div class="mt-2 w-full bg-gray-800 rounded-full h-1.5">
                          <div
                            class="bg-indigo-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.round(entry.progress * 100)}%` }}
                          />
                        </div>
                      </Show>
                      <Show when={entry.error}>
                        <p class="text-xs text-red-400 mt-1">Failed to remove — click Retry</p>
                      </Show>
                    </div>
                    <span class={["text-xs font-medium", { [statusColor(entry.status)]: true }]}>
                      {entry.status}
                    </span>
                    <Show
                      when={entry.error}
                      fallback={
                        <button
                          onClick={() => void remove(entry)}
                          class="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
                        >
                          Remove
                        </button>
                      }
                    >
                      <button
                        onClick={() => void retryRemove(entry.id)}
                        disabled={entry.pending}
                        class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
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
