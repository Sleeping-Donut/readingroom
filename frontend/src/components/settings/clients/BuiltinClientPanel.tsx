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
		<div class="mb-4 rounded-lg border border-gray-800 bg-gray-900 p-4">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<StatusDot status={props.result?.status ?? "idle"} />
					<h4 class="font-medium">HTTP (Direct)</h4>
					<span class="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">
						Built-in
					</span>
					<Show when={props.result?.status === "success"}>
						<span class="rounded border border-green-800 bg-green-900/40 px-1.5 py-0.5 text-xs text-green-400">
							Connected
						</span>
					</Show>
					<Show when={props.result?.status === "error"}>
						<span class="rounded border border-red-800 bg-red-900/40 px-1.5 py-0.5 text-xs text-red-400">
							Disconnected
						</span>
					</Show>
				</div>
				<button
					onClick={() => props.onToggleEnabled(!props.form.enabled)}
					class={[
						"rounded px-3 py-1.5 text-sm transition-colors",
						props.form.enabled
							? "bg-green-700 hover:bg-green-600"
							: "bg-gray-700 hover:bg-gray-600",
					]}
				>
					{props.form.enabled ? "Enabled" : "Disabled"}
				</button>
			</div>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div>
					<label for="builtin-download-dir" class="mb-1 block text-xs text-gray-400">
						Download Directory
					</label>
					<input
						id="builtin-download-dir"
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
					<label for="builtin-rate-limit" class="mb-1 block text-xs text-gray-400">
						Rate Limit (KB/s)
					</label>
					<input
						id="builtin-rate-limit"
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
					<label for="builtin-concurrent" class="mb-1 block text-xs text-gray-400">
						Concurrent Downloads
					</label>
					<input
						id="builtin-concurrent"
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
				<p class="mt-2 text-xs text-green-400">
					✓ Connected
					<Show when={props.result?.version}> · v{props.result?.version}</Show>
					<Show when={props.result?.default_save_path}>
						{" "}
						· {props.result?.default_save_path}
					</Show>
				</p>
			</Show>
			<Show when={props.result?.status === "error"}>
				<p class="mt-2 text-xs text-red-400">✗ {props.result?.message}</p>
			</Show>
			<div class="mt-3 flex items-center gap-3">
				<button
					onClick={props.onSave}
					disabled={props.saving}
					class="rounded bg-green-700 px-4 py-2 text-sm transition-colors hover:bg-green-600 disabled:bg-gray-600"
				>
					Save
				</button>
				<button
					onClick={props.onTest}
					disabled={props.result?.status === "testing"}
					class="rounded bg-indigo-700 px-4 py-2 text-sm transition-colors hover:bg-indigo-600"
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
