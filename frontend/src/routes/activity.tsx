import { createMemo, Errored, For, Loading, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { api } from "../api/client";
import type { HistoryItem } from "../types";

export default function Activity() {
  const history = createMemo(async () => api.get<{ history: HistoryItem[] }>("/history"));

  return (
    <div>
      <Title>Activity · ReadingRoom</Title>
      <h2 class="text-2xl font-bold mb-6">Activity</h2>

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
            when={history().history.length > 0}
            fallback={
              <div class="text-center py-12 text-gray-500">
                <p class="text-lg">No history yet.</p>
                <p class="text-sm mt-2">Download and import activity will appear here.</p>
              </div>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-gray-400 border-b border-gray-800">
                    <th class="pb-3 pr-4">Event</th>
                    <th class="pb-3 pr-4">Title</th>
                    <th class="pb-3 pr-4">Details</th>
                    <th class="pb-3 pr-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={history().history}>
                    {(item) => (
                      <tr class="border-b border-gray-800/50 hover:bg-gray-900/50">
                        <td class="py-3 pr-4">
                          <span class="text-xs font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                            {item.event_type}
                          </span>
                        </td>
                        <td class="py-3 pr-4 text-gray-200 truncate max-w-xs">
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
                            <span> · {(item.size! / 1_000_000).toFixed(1)} MB</span>
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
