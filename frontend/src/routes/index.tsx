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
					<p class="mt-2 text-sm text-bad">
						Failed to load: {String(err())}{" "}
						<button onClick={reset} class="ml-1 text-accent underline">
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-ink-500">Loading...</p>}>
					<div>
						<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<a
								href={paths.authors}
								class="block rounded-lg border border-rule bg-paper-100 p-4 transition-colors hover:border-ink-900"
							>
								<p class="text-sm text-ink-700">Total Authors</p>
								<p class="mt-1 text-2xl font-bold">{stats().total_authors}</p>
							</a>

							<a
								href={paths.books}
								class="block rounded-lg border border-rule bg-paper-100 p-4 transition-colors hover:border-ink-900"
							>
								<p class="text-sm text-ink-700">Total Books</p>
								<p class="mt-1 text-2xl font-bold">{stats().total_books}</p>
							</a>

							<a
								href={paths.wanted}
								class={[
									"block rounded-lg border p-4 transition-colors",
									{
										"border-pending/40 bg-pending/10 hover:border-pending":
											stats().wanted_books > 0,
										"border-rule bg-paper-100 hover:border-ink-900":
											stats().wanted_books <= 0,
									},
								]}
							>
								<p class="text-sm text-ink-700">Wanted Books</p>
								<p
									class={[
										"mt-1 text-2xl font-bold",
										{ "text-pending": stats().wanted_books > 0 },
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
										"border-pending/40 bg-pending/10 hover:border-pending":
											stats().active_queue > 0,
										"border-rule bg-paper-100 hover:border-ink-900":
											stats().active_queue <= 0,
									},
								]}
							>
								<p class="text-sm text-ink-700">Active Downloads</p>
								<p
									class={[
										"mt-1 text-2xl font-bold",
										{ "text-pending": stats().active_queue > 0 },
									]}
								>
									{stats().active_queue}
								</p>
							</a>
						</div>

						<div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
							<div class="rounded-lg border border-rule bg-paper-100 p-4">
								<p class="mb-3 text-sm text-ink-700">Library</p>
								<div class="space-y-2">
									<div class="flex justify-between">
										<span class="text-ink-700">Total Files</span>
										<span class="font-medium">{stats().total_files}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-ink-700">Total Size</span>
										<span class="font-medium">
											{formatSize(stats().total_size)}
										</span>
									</div>
								</div>
							</div>

							<div class="rounded-lg border border-rule bg-paper-100 p-4">
								<p class="mb-3 text-sm text-ink-700">System</p>
								<div class="space-y-2">
									<div class="flex justify-between">
										<span class="text-ink-700">Version</span>
										<span class="font-medium">v{status().version}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-ink-700">Auth</span>
										<span
											class={[
												"font-medium",
												{
													"text-good": status().auth_enabled,
													"text-ink-700": !status().auth_enabled,
												},
											]}
										>
											{status().auth_enabled ? "Enabled" : "Disabled"}
										</span>
									</div>
								</div>
							</div>
						</div>

						<div class="rounded-lg border border-rule bg-paper-100 p-4">
							<h3 class="mb-4 text-lg font-semibold">Recent Activity</h3>
							<Show
								when={stats().recent_history.length > 0}
								fallback={
									<p class="py-4 text-center text-sm text-ink-500">
										No recent activity.
									</p>
								}
							>
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead>
											<tr class="border-b border-rule text-left text-ink-700">
												<th class="pr-4 pb-3">Event</th>
												<th class="pr-4 pb-3">Title</th>
												<th class="pr-4 pb-3">Date</th>
											</tr>
										</thead>
										<tbody>
											<For each={stats().recent_history}>
												{(item) => (
													<tr class="border-b border-rule hover:bg-paper-200/30">
														<td class="py-3 pr-4">
															<span class="rounded bg-paper-200 px-2 py-0.5 text-xs font-medium text-ink-900">
																{item.event_type}
															</span>
														</td>
														<td class="max-w-xs truncate py-3 pr-4 text-ink-900">
															{item.source_title || "-"}
														</td>
														<td class="py-3 pr-4 whitespace-nowrap text-ink-700">
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
