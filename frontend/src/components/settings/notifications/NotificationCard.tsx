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
    <span class={["text-xs", { "text-green-400": on, "text-gray-600": !on }]}>
      {on ? "\u2713" : "\u2717"} {label}
    </span>
  );
  return (
    <div
      class={[
        "flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-900 rounded-lg border transition-colors",
        { "border-red-800": !!props.notif.error, "border-gray-800": !props.notif.error },
      ]}
    >
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">{props.notif.name}</p>
        <p class="text-xs text-gray-400">
          {props.notif.implementation}
          {settings().webhook_url && ` · ${settings().webhook_url}`}
        </p>
        <div class="flex gap-3 mt-1 text-xs">
          {event(props.notif.on_grab, "Grab")}
          {event(props.notif.on_import, "Import")}
          {event(props.notif.on_upgrade, "Upgrade")}
          {event(props.notif.on_health_issue, "Health")}
        </div>
        <Show when={props.notif.error}>
          <p class="text-xs text-red-400 mt-1">Failed to remove — click Retry</p>
        </Show>
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <button
          onClick={props.onTest}
          disabled={props.notif.pending}
          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 rounded text-xs transition-colors"
        >
          Test
        </button>
        <Show
          when={props.notif.error}
          fallback={
            <button
              onClick={props.onRemove}
              class="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
            >
              Remove
            </button>
          }
        >
          <button
            onClick={props.onRetry}
            disabled={props.notif.pending}
            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
          >
            {props.notif.pending ? "Retrying..." : "Retry"}
          </button>
        </Show>
      </div>
    </div>
  );
}
