import { Match, Show, Switch, createMemo } from "solid-js";

import { parseClientSettings, type ClientRow } from "../../../resources/clients";
import { implementationLabel } from "../shared";
import StatusDot from "../StatusDot";

/// Display card for one configured download client.
export function ClientCard(props: {
  client: ClientRow;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onTest: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const settings = createMemo(() => parseClientSettings(props.client.settings));
  const endpoint = () =>
    props.client.implementation === "http" ? settings().download_dir : settings().host;
  return (
    <div
      class={[
        "flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-900 rounded-lg border transition-colors",
        { "border-red-800": !!props.client.error, "border-gray-800": !props.client.error },
      ]}
    >
      <StatusDot status={props.client.test?.status ?? "idle"} />
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">
          <span class={props.client.enabled ? "" : "text-gray-500"}>{props.client.name}</span>
          {!props.client.enabled && <span class="ml-2 text-xs text-gray-500">Disabled</span>}
        </p>
        <p class="text-xs text-gray-400">
          {implementationLabel(props.client.implementation)}
          <Show when={endpoint()}>
            {" · "}
            <Switch>
              <Match when={props.client.implementation === "http"}>{settings().download_dir}</Match>
              <Match when={props.client.implementation !== "http"}>
                {settings().host}
                <Show when={settings().port}>:{settings().port}</Show>
              </Match>
            </Switch>
          </Show>
          <Show when={props.client.test}>
            <Switch>
              <Match when={props.client.test?.status === "success"}>
                <span class="ml-1.5 text-xs bg-green-900/40 text-green-400 border border-green-800 rounded px-1.5 py-0.5">
                  Connected
                </span>
              </Match>
              <Match when={props.client.test?.status === "error"}>
                <span class="ml-1.5 text-xs bg-red-900/40 text-red-400 border border-red-800 rounded px-1.5 py-0.5">
                  Disconnected
                </span>
              </Match>
            </Switch>
          </Show>
        </p>
        <Show when={props.client.test?.status === "success"}>
          <p class="text-xs text-green-400 mt-1">
            ✓ Connected
            <Show when={props.client.test?.version}> · v{props.client.test?.version}</Show>
            <Show when={props.client.test?.default_save_path}>
              {" "}
              · {props.client.test?.default_save_path}
            </Show>
          </p>
        </Show>
        <Show when={props.client.test?.status === "error"}>
          <p class="text-xs text-red-400 mt-1">✗ {props.client.test?.message}</p>
        </Show>
        <Show when={props.client.error}>
          <p class="text-xs text-red-400 mt-1">Failed to remove — click Retry</p>
        </Show>
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <button
          onClick={() => props.onToggleEnabled(!props.client.enabled)}
          class={[
            "px-2 py-1 rounded text-xs transition-colors",
            props.client.enabled
              ? "bg-green-700 hover:bg-green-600"
              : "bg-gray-700 hover:bg-gray-600",
          ]}
        >
          {props.client.enabled ? "Enabled" : "Disabled"}
        </button>
        <button
          onClick={props.onEdit}
          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
        >
          Edit
        </button>
        <button
          onClick={props.onTest}
          disabled={props.client.test?.status === "testing"}
          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
        >
          {props.client.test?.status === "testing" ? "Testing..." : "Test"}
        </button>
        <Show
          when={props.client.error}
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
            disabled={props.client.pending}
            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
          >
            {props.client.pending ? "Retrying..." : "Retry"}
          </button>
        </Show>
      </div>
    </div>
  );
}
