import { Show } from "solid-js";

import type { BuiltinForm } from "../../../resources/clients";
import type { TestResult } from "../../../types";

import StatusDot from "../StatusDot";

const inputClass = "w-full px-3 py-2 bg-paper-200 border border-rule rounded text-sm";

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
		<div class="mb-4 rounded-lg border border-rule bg-paper-100 p-4">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<StatusDot status={props.result?.status ?? "idle"} />
					<h4 class="font-medium">HTTP (Direct)</h4>
					<span class="rounded border border-rule bg-paper-200 px-1.5 py-0.5 text-xs text-ink-700">
						Built-in
					</span>
					<Show when={props.result?.status === "success"}>
						<span class="rounded border border-good/30 bg-good/10 px-1.5 py-0.5 text-xs text-good">
							Connected
						</span>
					</Show>
					<Show when={props.result?.status === "error"}>
						<span class="rounded border border-bad/30 bg-bad/10 px-1.5 py-0.5 text-xs text-bad">
							Disconnected
						</span>
					</Show>
				</div>
				<button
					onClick={() => props.onToggleEnabled(!props.form.enabled)}
					class={[
						"rounded px-3 py-1.5 text-sm transition-colors",
						props.form.enabled
							? "bg-good hover:opacity-90"
							: "bg-paper-200 hover:bg-paper-200",
					]}
				>
					{props.form.enabled ? "Enabled" : "Disabled"}
				</button>
			</div>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div>
					<label for="builtin-download-dir" class="mb-1 block text-xs text-ink-700">
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
					<label for="builtin-rate-limit" class="mb-1 block text-xs text-ink-700">
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
					<label for="builtin-concurrent" class="mb-1 block text-xs text-ink-700">
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
				<p class="mt-2 text-xs text-good">
					✓ Connected
					<Show when={props.result?.version}> · v{props.result?.version}</Show>
					<Show when={props.result?.default_save_path}>
						{" "}
						· {props.result?.default_save_path}
					</Show>
				</p>
			</Show>
			<Show when={props.result?.status === "error"}>
				<p class="mt-2 text-xs text-bad">✗ {props.result?.message}</p>
			</Show>
			<div class="mt-3 flex items-center gap-3">
				<button
					onClick={props.onSave}
					disabled={props.saving}
					class="rounded bg-good px-4 py-2 text-sm text-paper-50 transition-colors hover:opacity-90 disabled:opacity-50"
				>
					Save
				</button>
				<button
					onClick={props.onTest}
					disabled={props.result?.status === "testing"}
					class="rounded bg-ink-900 px-4 py-2 text-sm text-paper-50 transition-colors hover:bg-ink-700"
				>
					{props.result?.status === "testing" ? "Testing..." : "Test"}
				</button>
				<p class="text-xs text-ink-500">
					The built-in HTTP downloader streams release URLs to disk.
				</p>
			</div>
		</div>
	);
}
