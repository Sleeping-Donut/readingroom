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
				"flex flex-col gap-3 rounded-lg border bg-paper-100 p-3 transition-colors sm:flex-row sm:items-center",
				{ "border-bad/30": !!props.client.error, "border-rule": !props.client.error },
			]}
		>
			<StatusDot status={props.client.test?.status ?? "idle"} />
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">
					<span class={props.client.enabled ? "" : "text-ink-500"}>
						{props.client.name}
					</span>
					{!props.client.enabled && (
						<span class="ml-2 text-xs text-ink-500">Disabled</span>
					)}
				</p>
				<p class="text-xs text-ink-700">
					{implementationLabel(props.client.implementation)}
					<Show when={endpoint()}>
						{" · "}
						<Switch>
							<Match when={props.client.implementation === "http"}>
								{settings().download_dir}
							</Match>
							<Match when={props.client.implementation !== "http"}>
								{settings().host}
								<Show when={settings().port}>:{settings().port}</Show>
							</Match>
						</Switch>
					</Show>
					<Show when={props.client.test}>
						<Switch>
							<Match when={props.client.test?.status === "success"}>
								<span class="ml-1.5 rounded border border-good/30 bg-good/10 px-1.5 py-0.5 text-xs text-good">
									Connected
								</span>
							</Match>
							<Match when={props.client.test?.status === "error"}>
								<span class="ml-1.5 rounded border border-bad/30 bg-bad/10 px-1.5 py-0.5 text-xs text-bad">
									Disconnected
								</span>
							</Match>
						</Switch>
					</Show>
				</p>
				<Show when={props.client.test?.status === "success"}>
					<p class="mt-1 text-xs text-good">
						✓ Connected
						<Show when={props.client.test?.version}>
							{" "}
							· v{props.client.test?.version}
						</Show>
						<Show when={props.client.test?.default_save_path}>
							{" "}
							· {props.client.test?.default_save_path}
						</Show>
					</p>
				</Show>
				<Show when={props.client.test?.status === "error"}>
					<p class="mt-1 text-xs text-bad">✗ {props.client.test?.message}</p>
				</Show>
				<Show when={props.client.error}>
					<p class="mt-1 text-xs text-bad">Failed to remove — click Retry</p>
				</Show>
			</div>
			<div class="flex shrink-0 flex-wrap gap-2">
				<button
					onClick={() => props.onToggleEnabled(!props.client.enabled)}
					class={[
						"rounded px-2 py-1 text-xs transition-colors",
						props.client.enabled
							? "bg-good text-paper-50 hover:opacity-90"
							: "bg-paper-200 hover:bg-paper-200",
					]}
				>
					{props.client.enabled ? "Enabled" : "Disabled"}
				</button>
				<button
					onClick={props.onEdit}
					class="rounded bg-ink-900 px-2 py-1 text-xs text-paper-50 transition-colors hover:bg-ink-700"
				>
					Edit
				</button>
				<button
					onClick={props.onTest}
					disabled={props.client.test?.status === "testing"}
					class="rounded bg-ink-900 px-2 py-1 text-xs text-paper-50 transition-colors hover:bg-ink-700"
				>
					{props.client.test?.status === "testing" ? "Testing..." : "Test"}
				</button>
				<Show
					when={props.client.error}
					fallback={
						<button
							onClick={props.onRemove}
							class="rounded bg-bad px-2 py-1 text-xs text-paper-50 transition-colors hover:opacity-90"
						>
							Remove
						</button>
					}
				>
					<button
						onClick={props.onRetry}
						disabled={props.client.pending}
						class="rounded bg-ink-900 px-2 py-1 text-xs text-paper-50 transition-colors hover:bg-ink-700 disabled:bg-paper-200"
					>
						{props.client.pending ? "Retrying..." : "Retry"}
					</button>
				</Show>
			</div>
		</div>
	);
}
