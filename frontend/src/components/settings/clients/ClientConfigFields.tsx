import { Show } from "solid-js";

import type { Draft } from "../../../resources/clients";

const inputClass = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm";

export const CLIENT_IMPL_OPTIONS = [
	{ value: "transmission", label: "Transmission" },
	{ value: "qbittorrent", label: "qBittorrent" },
	{ value: "deluge", label: "Deluge" },
	{ value: "http", label: "HTTP (Direct)" },
];

/// One shared config form for every client implementation: connection fields
/// for torrent/usenet clients, rate/concurrency fields for the built-in HTTP
/// downloader. Field visibility follows `draft.implementation`.
function ClientConfigFields(props: {
	draft: Draft;
	setDraft: (mutate: (d: Draft) => void) => void;
}) {
	const isHttp = () => props.draft.implementation === "http";
	return (
		<div class="sm:grid-cols-2 gap-3 grid grid-cols-1">
			<div>
				<label class="text-xs text-gray-400 mb-1 block">Name</label>
				<input
					value={props.draft.name}
					onInput={(e) =>
						props.setDraft((d) => {
							d.name = e.currentTarget.value;
						})
					}
					class={inputClass}
					placeholder="My Download Client"
				/>
			</div>
			<div>
				<label class="text-xs text-gray-400 mb-1 block">Type</label>
				<select
					value={props.draft.implementation}
					onChange={(e) =>
						props.setDraft((d) => {
							d.implementation = e.currentTarget.value;
						})
					}
					class={inputClass}
				>
					{CLIENT_IMPL_OPTIONS.map((opt) => (
						<option value={opt.value}>{opt.label}</option>
					))}
				</select>
			</div>
			<Show when={!isHttp()}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Host</label>
					<input
						value={props.draft.host}
						onInput={(e) =>
							props.setDraft((d) => {
								d.host = e.currentTarget.value;
							})
						}
						class={inputClass}
						placeholder="localhost"
					/>
				</div>
			</Show>
			<Show when={!isHttp()}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Port</label>
					<input
						type="number"
						value={props.draft.port}
						onInput={(e) =>
							props.setDraft((d) => {
								d.port = Number(e.currentTarget.value);
							})
						}
						class={inputClass}
						placeholder="9091"
					/>
				</div>
			</Show>
			<Show when={!isHttp()}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Username</label>
					<input
						value={props.draft.username}
						onInput={(e) =>
							props.setDraft((d) => {
								d.username = e.currentTarget.value;
							})
						}
						class={inputClass}
						placeholder="Optional"
					/>
				</div>
			</Show>
			<Show when={!isHttp()}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Password</label>
					<input
						type="password"
						value={props.draft.password}
						onInput={(e) =>
							props.setDraft((d) => {
								d.password = e.currentTarget.value;
							})
						}
						class={inputClass}
						placeholder="Optional"
					/>
				</div>
			</Show>
			<Show when={!isHttp()}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">URL Base</label>
					<input
						value={props.draft.url_base}
						onInput={(e) =>
							props.setDraft((d) => {
								d.url_base = e.currentTarget.value;
							})
						}
						class={inputClass}
						placeholder="/transmission/"
					/>
				</div>
			</Show>
			<Show when={!isHttp()}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Category</label>
					<input
						value={props.draft.category}
						onInput={(e) =>
							props.setDraft((d) => {
								d.category = e.currentTarget.value;
							})
						}
						class={inputClass}
						placeholder="books"
					/>
				</div>
			</Show>
			<div>
				<label class="text-xs text-gray-400 mb-1 block">Download Directory</label>
				<input
					value={props.draft.download_dir}
					onInput={(e) =>
						props.setDraft((d) => {
							d.download_dir = e.currentTarget.value;
						})
					}
					class={inputClass}
					placeholder="./downloads"
				/>
			</div>
			<Show when={isHttp()}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Rate Limit (KB/s)</label>
					<input
						type="number"
						value={props.draft.rate_limit_kb}
						onInput={(e) =>
							props.setDraft((d) => {
								d.rate_limit_kb = e.currentTarget.value;
							})
						}
						class={inputClass}
						placeholder="Unlimited"
					/>
				</div>
			</Show>
			<Show when={isHttp()}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Concurrent Downloads</label>
					<input
						type="number"
						value={props.draft.concurrent_downloads}
						onInput={(e) =>
							props.setDraft((d) => {
								d.concurrent_downloads = e.currentTarget.value;
							})
						}
						class={inputClass}
						placeholder="2"
					/>
				</div>
			</Show>
		</div>
	);
}

export default ClientConfigFields;
