import { For } from "solid-js";

import type { Draft } from "../../../resources/notifications";

const inputClass = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm";

const EVENT_TOGGLES = [
	{ key: "on_grab", label: "On Grab" },
	{ key: "on_import", label: "On Import" },
	{ key: "on_upgrade", label: "On Upgrade" },
	{ key: "on_health_issue", label: "On Health Issue" },
] as const;

/// Add-flow panel for a new notification.
export function AddNotificationForm(props: {
	draft: Draft;
	setDraft: (mutate: (d: Draft) => void) => void;
	submitting: boolean;
	valid: boolean;
	onSave: () => void;
	onCancel: () => void;
}) {
	return (
		<div class="mb-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
			<div class="flex flex-col gap-3">
				<div class="flex items-end gap-3">
					<div class="flex-1">
						<label class="mb-1 block text-xs text-gray-400">Name</label>
						<input
							value={props.draft.name}
							onInput={(e) =>
								props.setDraft((d) => {
									d.name = e.currentTarget.value;
								})
							}
							class={inputClass}
							placeholder="My Notification"
						/>
					</div>
					<div>
						<label class="mb-1 block text-xs text-gray-400">Implementation</label>
						<select
							value={props.draft.implementation}
							onChange={(e) =>
								props.setDraft((d) => {
									d.implementation = e.currentTarget.value;
								})
							}
							class="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
						>
							<option value="apprise">Apprise</option>
						</select>
					</div>
				</div>
				<div>
					<label class="mb-1 block text-xs text-gray-400">Webhook URL</label>
					<input
						value={props.draft.webhook_url}
						onInput={(e) =>
							props.setDraft((d) => {
								d.webhook_url = e.currentTarget.value;
							})
						}
						class={inputClass}
						placeholder="https://hooks.example.com/..."
					/>
				</div>
				<div class="flex flex-wrap items-center gap-6">
					<For each={EVENT_TOGGLES}>
						{(toggle) => (
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={props.draft[toggle.key]}
									onChange={(e) =>
										props.setDraft((d) => {
											d[toggle.key] = e.currentTarget.checked;
										})
									}
									class="rounded border-gray-700 bg-gray-800"
								/>
								{toggle.label}
							</label>
						)}
					</For>
					<button
						onClick={props.onSave}
						disabled={props.submitting || !props.valid}
						class="rounded bg-green-700 px-4 py-2 text-sm transition-colors hover:bg-green-600 disabled:bg-gray-600"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}
