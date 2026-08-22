import { Show, createMemo } from "solid-js";

import { parseNotificationSettings, type NotificationRow } from "../../../resources/notifications";

/// Display card for one configured notification.
export function NotificationCard(props: {
	notif: NotificationRow;
	onTest: () => void;
	onRemove: () => void;
	onRetry: () => void;
}) {
	const settings = createMemo(() => parseNotificationSettings(props.notif.settings));
	const event = (on: boolean, label: string) => (
		<span class={["text-xs", { "text-good": on, "text-ink-500": !on }]}>
			{on ? "\u2713" : "\u2717"} {label}
		</span>
	);
	return (
		<div
			class={[
				"flex flex-col gap-3 rounded-lg border bg-paper-100 p-3 transition-colors sm:flex-row sm:items-center",
				{ "border-bad/30": !!props.notif.error, "border-rule": !props.notif.error },
			]}
		>
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">{props.notif.name}</p>
				<p class="text-xs text-ink-700">
					{props.notif.implementation}
					{settings().webhook_url && ` · ${settings().webhook_url}`}
				</p>
				<div class="mt-1 flex gap-3 text-xs">
					{event(props.notif.on_grab, "Grab")}
					{event(props.notif.on_import, "Import")}
					{event(props.notif.on_upgrade, "Upgrade")}
					{event(props.notif.on_health_issue, "Health")}
				</div>
				<Show when={props.notif.error}>
					<p class="mt-1 text-xs text-bad">Failed to remove — click Retry</p>
				</Show>
			</div>
			<div class="flex shrink-0 flex-wrap gap-2">
				<button
					onClick={props.onTest}
					disabled={props.notif.pending}
					class="rounded bg-ink-900 px-2 py-1 text-xs text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
				>
					Test
				</button>
				<Show
					when={props.notif.error}
					fallback={
						<button
							onClick={props.onRemove}
							class="rounded bg-bad px-2 py-1 text-xs transition-colors hover:opacity-90"
						>
							Remove
						</button>
					}
				>
					<button
						onClick={props.onRetry}
						disabled={props.notif.pending}
						class="rounded bg-ink-900 px-2 py-1 text-xs text-paper-50 transition-colors hover:bg-ink-700 disabled:bg-paper-200"
					>
						{props.notif.pending ? "Retrying..." : "Retry"}
					</button>
				</Show>
			</div>
		</div>
	);
}
