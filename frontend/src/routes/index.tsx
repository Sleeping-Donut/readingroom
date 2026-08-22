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
			<h2 class="mb-6 text-2xl font-bold">Dashboard</h2>

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
					<div>
						<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<a
								href={paths.authors}
								class="block rounded-lg border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-indigo-600"
							>
								<p class="text-sm text-gray-400">Total Authors</p>
								<p class="mt-1 text-2xl font-bold">{stats().total_authors}</p>
							</a>

							<a
								href={paths.books}
								class="block rounded-lg border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-indigo-600"
							>
								<p class="text-sm text-gray-400">Total Books</p>
								<p class="mt-1 text-2xl font-bold">{stats().total_books}</p>
							</a>

							<a
								href={paths.wanted}
								class={[
									"block rounded-lg border p-4 transition-colors",
									{
										"border-yellow-700 bg-yellow-900/30 hover:border-yellow-500":
											stats().wanted_books > 0,
										"border-gray-800 bg-gray-900 hover:border-indigo-600":
											stats().wanted_books <= 0,
									},
								]}
							>
								<p class="text-sm text-gray-400">Wanted Books</p>
								<p
									class={[
										"mt-1 text-2xl font-bold",
										{ "text-yellow-400": stats().wanted_books > 0 },
									]}
								>
									{stats().wanted_books}
								</p>
							</a>

							<a
								href={paths.queue}
								class={[
									"block rounded-lg border p-4 transition-colors",
									{
										"border-blue-700 bg-blue-900/30 hover:border-blue-500":
											stats().active_queue > 0,
										"border-gray-800 bg-gray-900 hover:border-indigo-600":
											stats().active_queue <= 0,
									},
								]}
							>
								<p class="text-sm text-gray-400">Active Downloads</p>
								<p
									class={[
										"mt-1 text-2xl font-bold",
										{ "text-blue-400": stats().active_queue > 0 },
									]}
								>
									{stats().active_queue}
								</p>
							</a>
						</div>

						<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
							<div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
								<p class="mb-3 text-sm text-gray-400">Library</p>
								<div class="space-y-2">
									<div class="flex justify-between">
										<span class="text-gray-400">Total Files</span>
										<span class="font-medium">{stats().total_files}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-400">Total Size</span>
										<span class="font-medium">
											{formatSize(stats().total_size)}
										</span>
									</div>
								</div>
							</div>

							<div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
								<p class="mb-3 text-sm text-gray-400">System</p>
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

						<div class="rounded-lg border border-gray-800 bg-gray-900 p-4">
							<h3 class="mb-4 text-lg font-semibold">Recent Activity</h3>
							<Show
								when={stats().recent_history.length > 0}
								fallback={
									<p class="py-4 text-center text-sm text-gray-500">
										No recent activity.
									</p>
								}
							>
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead>
											<tr class="border-b border-gray-800 text-left text-gray-400">
												<th class="pr-4 pb-3">Event</th>
												<th class="pr-4 pb-3">Title</th>
												<th class="pr-4 pb-3">Date</th>
											</tr>
										</thead>
										<tbody>
											<For each={stats().recent_history}>
												{(item) => (
													<tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
														<td class="py-3 pr-4">
															<span class="rounded bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-300">
																{item.event_type}
															</span>
														</td>
														<td class="max-w-xs truncate py-3 pr-4 text-gray-200">
															{item.source_title || "-"}
														</td>
														<td class="py-3 pr-4 whitespace-nowrap text-gray-400">
															{new Date(
																item.date,
															).toLocaleDateString()}
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
