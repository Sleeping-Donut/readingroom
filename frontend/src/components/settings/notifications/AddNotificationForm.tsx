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
		<div class="mb-4 p-4 bg-gray-900 rounded-lg border-gray-800 border">
			<div class="gap-3 flex flex-col">
				<div class="gap-3 flex items-end">
					<div class="flex-1">
						<label class="text-xs text-gray-400 mb-1 block">Name</label>
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
						<label class="text-xs text-gray-400 mb-1 block">Implementation</label>
						<select
							value={props.draft.implementation}
							onChange={(e) =>
								props.setDraft((d) => {
									d.implementation = e.currentTarget.value;
								})
							}
							class="px-3 py-2 bg-gray-800 border-gray-700 rounded text-sm border"
						>
							<option value="apprise">Apprise</option>
						</select>
					</div>
				</div>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Webhook URL</label>
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
				<div class="gap-6 flex flex-wrap items-center">
					<For each={EVENT_TOGGLES}>
						{(toggle) => (
							<label class="gap-2 text-sm flex items-center">
								<input
									type="checkbox"
									checked={props.draft[toggle.key]}
									onChange={(e) =>
										props.setDraft((d) => {
											d[toggle.key] = e.currentTarget.checked;
										})
									}
									class="rounded bg-gray-800 border-gray-700"
								/>
								{toggle.label}
							</label>
						)}
					</For>
					<button
						onClick={props.onSave}
						disabled={props.submitting || !props.valid}
						class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}
