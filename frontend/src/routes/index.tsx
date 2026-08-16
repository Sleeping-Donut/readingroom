import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, Errored, For, Loading, Show } from "solid-js";

import { getSystemStatus, getSystemStats } from "../api/system";
import { paths } from "../router";

export const route = defineFileRoute("/", {
  preload: () => {
    void getSystemStatus();
    void getSystemStats();
  },
});

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export default function Dashboard() {
  const status = createMemo(() => getSystemStatus());
  const stats = createMemo(() => getSystemStats());

  return (
    <div>
      <Title>Dashboard · ReadingRoom</Title>
      <h2 class="text-2xl font-bold mb-6">Dashboard</h2>

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
          <div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <a
                href={paths.authors}
                class="block p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-indigo-600 transition-colors"
              >
                <p class="text-sm text-gray-400">Total Authors</p>
                <p class="text-2xl font-bold mt-1">{stats().total_authors}</p>
              </a>

              <a
                href={paths.books}
                class="block p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-indigo-600 transition-colors"
              >
                <p class="text-sm text-gray-400">Total Books</p>
                <p class="text-2xl font-bold mt-1">{stats().total_books}</p>
              </a>

              <a
                href={paths.wanted}
                class={[
                  "block p-4 rounded-lg border transition-colors",
                  {
                    "bg-yellow-900/30 border-yellow-700 hover:border-yellow-500":
                      stats().wanted_books > 0,
                    "bg-gray-900 border-gray-800 hover:border-indigo-600":
                      stats().wanted_books <= 0,
                  },
                ]}
              >
                <p class="text-sm text-gray-400">Wanted Books</p>
                <p
                  class={[
                    "text-2xl font-bold mt-1",
                    { "text-yellow-400": stats().wanted_books > 0 },
                  ]}
                >
                  {stats().wanted_books}
                </p>
              </a>

              <a
                href={paths.queue}
                class={[
                  "block p-4 rounded-lg border transition-colors",
                  {
                    "bg-blue-900/30 border-blue-700 hover:border-blue-500":
                      stats().active_queue > 0,
                    "bg-gray-900 border-gray-800 hover:border-indigo-600":
                      stats().active_queue <= 0,
                  },
                ]}
              >
                <p class="text-sm text-gray-400">Active Downloads</p>
                <p
                  class={["text-2xl font-bold mt-1", { "text-blue-400": stats().active_queue > 0 }]}
                >
                  {stats().active_queue}
                </p>
              </a>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div class="p-4 bg-gray-900 rounded-lg border border-gray-800">
                <p class="text-sm text-gray-400 mb-3">Library</p>
                <div class="space-y-2">
                  <div class="flex justify-between">
                    <span class="text-gray-400">Total Files</span>
                    <span class="font-medium">{stats().total_files}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-400">Total Size</span>
                    <span class="font-medium">{formatSize(stats().total_size)}</span>
                  </div>
                </div>
              </div>

              <div class="p-4 bg-gray-900 rounded-lg border border-gray-800">
                <p class="text-sm text-gray-400 mb-3">System</p>
                <div class="space-y-2">
                  <div class="flex justify-between">
                    <span class="text-gray-400">Version</span>
                    <span class="font-medium">v{status().version}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-400">Auth</span>
                    <span
                      class={[
                        "font-medium",
                        {
                          "text-green-400": status().auth_enabled,
                          "text-gray-400": !status().auth_enabled,
                        },
                      ]}
                    >
                      {status().auth_enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="p-4 bg-gray-900 rounded-lg border border-gray-800">
              <h3 class="text-lg font-semibold mb-4">Recent Activity</h3>
              <Show
                when={stats().recent_history.length > 0}
                fallback={<p class="text-gray-500 text-sm py-4 text-center">No recent activity.</p>}
              >
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-gray-400 border-b border-gray-800">
                        <th class="pb-3 pr-4">Event</th>
                        <th class="pb-3 pr-4">Title</th>
                        <th class="pb-3 pr-4">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={stats().recent_history}>
                        {(item) => (
                          <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                            <td class="py-3 pr-4">
                              <span class="text-xs font-medium px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                                {item.event_type}
                              </span>
                            </td>
                            <td class="py-3 pr-4 text-gray-200 truncate max-w-xs">
                              {item.source_title || "-"}
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
            </div>
          </div>
        </Loading>
      </Errored>
    </div>
  );
}
