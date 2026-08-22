import { Show, createUniqueId } from "solid-js";

import type { Draft } from "../../../resources/clients";

const inputClass = "w-full px-3 py-2 bg-paper-200 border border-rule rounded text-sm";

export const CLIENT_IMPL_OPTIONS = [
	{ value: "transmission", label: "Transmission" },
	{ value: "qbittorrent", label: "qBittorrent" },
	{ value: "deluge", label: "Deluge" },
	{ value: "http", label: "HTTP (Direct)" },
];

/// One shared config form for every client implementation: connection fields
/// for torrent/usenet clients, rate/concurrency fields for the built-in HTTP
/// downloader. Field visibility follows `draft.implementation`. Ids are
/// instance-scoped because the add wizard and an edit panel can mount
/// alongside each other.
function ClientConfigFields(props: {
	draft: Draft;
	setDraft: (mutate: (d: Draft) => void) => void;
}) {
	const uid = createUniqueId();
	const fieldId = (name: string) => `${uid}-client-${name}`;
	const isHttp = () => props.draft.implementation === "http";
	return (
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div>
				<label for={fieldId("name")} class="mb-1 block text-xs text-ink-700">
					Name
				</label>
				<input
					id={fieldId("name")}
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
				<label for={fieldId("implementation")} class="mb-1 block text-xs text-ink-700">
					Type
				</label>
				<select
					id={fieldId("implementation")}
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
					<label for={fieldId("host")} class="mb-1 block text-xs text-ink-700">
						Host
					</label>
					<input
						id={fieldId("host")}
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
					<label for={fieldId("port")} class="mb-1 block text-xs text-ink-700">
						Port
					</label>
					<input
						id={fieldId("port")}
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
					<label for={fieldId("username")} class="mb-1 block text-xs text-ink-700">
						Username
					</label>
					<input
						id={fieldId("username")}
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
					<label for={fieldId("password")} class="mb-1 block text-xs text-ink-700">
						Password
					</label>
					<input
						id={fieldId("password")}
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
					<label for={fieldId("url_base")} class="mb-1 block text-xs text-ink-700">
						URL Base
					</label>
					<input
						id={fieldId("url_base")}
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
					<label for={fieldId("category")} class="mb-1 block text-xs text-ink-700">
						Category
					</label>
					<input
						id={fieldId("category")}
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
				<label for={fieldId("download_dir")} class="mb-1 block text-xs text-ink-700">
					Download Directory
				</label>
				<input
					id={fieldId("download_dir")}
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
					<label for={fieldId("rate_limit_kb")} class="mb-1 block text-xs text-ink-700">
						Rate Limit (KB/s)
					</label>
					<input
						id={fieldId("rate_limit_kb")}
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
					<label
						for={fieldId("concurrent_downloads")}
						class="mb-1 block text-xs text-ink-700"
					>
						Concurrent Downloads
					</label>
					<input
						id={fieldId("concurrent_downloads")}
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
