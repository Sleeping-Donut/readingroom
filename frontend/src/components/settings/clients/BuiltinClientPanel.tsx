import { Show } from "solid-js";

import type { BuiltinForm } from "../../../resources/clients";
import type { TestResult } from "../../../types";

import StatusDot from "../StatusDot";

const inputClass = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm";

/// Settings card for the built-in HTTP downloader.
export function BuiltinClientPanel(props: {
  form: BuiltinForm;
  setForm: (mutate: (f: BuiltinForm) => void) => void;
  result: TestResult | undefined;
  saving: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onSave: () => void;
  onTest: () => void;
}) {
  return (
    <div class="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-2">
          <StatusDot status={props.result?.status ?? "idle"} />
          <h4 class="font-medium">HTTP (Direct)</h4>
          <span class="text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded px-1.5 py-0.5">
            Built-in
          </span>
          <Show when={props.result?.status === "success"}>
            <span class="text-xs bg-green-900/40 text-green-400 border border-green-800 rounded px-1.5 py-0.5">
              Connected
            </span>
          </Show>
          <Show when={props.result?.status === "error"}>
            <span class="text-xs bg-red-900/40 text-red-400 border border-red-800 rounded px-1.5 py-0.5">
              Disconnected
            </span>
          </Show>
        </div>
        <button
          onClick={() => props.onToggleEnabled(!props.form.enabled)}
          class={[
            "px-3 py-1.5 rounded text-sm transition-colors",
            props.form.enabled
              ? "bg-green-700 hover:bg-green-600"
              : "bg-gray-700 hover:bg-gray-600",
          ]}
        >
          {props.form.enabled ? "Enabled" : "Disabled"}
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Download Directory</label>
          <input
            value={props.form.download_dir}
            onInput={(e) =>
              props.setForm((f) => {
                f.download_dir = e.currentTarget.value;
              })
            }
            class={inputClass}
            placeholder="./downloads"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Rate Limit (KB/s)</label>
          <input
            type="number"
            value={props.form.rate_limit_kb}
            onInput={(e) =>
              props.setForm((f) => {
                f.rate_limit_kb = e.currentTarget.value;
              })
            }
            class={inputClass}
            placeholder="Unlimited"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Concurrent Downloads</label>
          <input
            type="number"
            value={props.form.concurrent}
            onInput={(e) =>
              props.setForm((f) => {
                f.concurrent = e.currentTarget.value;
              })
            }
            class={inputClass}
            placeholder="2"
          />
        </div>
      </div>
      <Show when={props.result?.status === "success"}>
        <p class="text-xs text-green-400 mt-2">
          ✓ Connected
          <Show when={props.result?.version}> · v{props.result?.version}</Show>
          <Show when={props.result?.default_save_path}> · {props.result?.default_save_path}</Show>
        </p>
      </Show>
      <Show when={props.result?.status === "error"}>
        <p class="text-xs text-red-400 mt-2">✗ {props.result?.message}</p>
      </Show>
      <div class="flex gap-3 items-center mt-3">
        <button
          onClick={props.onSave}
          disabled={props.saving}
          class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
        >
          Save
        </button>
        <button
          onClick={props.onTest}
          disabled={props.result?.status === "testing"}
          class="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 rounded text-sm transition-colors"
        >
          {props.result?.status === "testing" ? "Testing..." : "Test"}
        </button>
        <p class="text-xs text-gray-500">
          The built-in HTTP downloader streams release URLs to disk.
        </p>
      </div>
    </div>
  );
}
