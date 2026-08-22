import { Title } from "@solidjs/meta";
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, createSignal, createStore, Errored, Loading, Show } from "solid-js";

import { getIntegrationSettings } from "../../api/settings";

export const route = defineFileRoute("/settings/integrations", {
	info: { label: "Integrations" },
	preload: () => {
		void getIntegrationSettings();
	},
});

function copyableRow(props: {
	label: string;
	value: string;
	placeholder?: string;
	secret?: boolean;
}) {
	const [copied, setCopied] = createSignal(false);
	const [revealed, setRevealed] = createSignal(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(props.value);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	return (
		<div class="mb-4">
			<label class="mb-1 block text-xs text-gray-400">{props.label}</label>
			<div class="flex items-center gap-2">
				<input
					type={props.secret && !revealed() ? "password" : "text"}
					readonly
					value={props.value}
					placeholder={props.placeholder ?? ""}
					class="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-gray-200"
				/>
				<Show when={props.secret}>
					<button
						onClick={() => setRevealed(!revealed())}
						class="rounded border border-gray-700 bg-gray-800 px-2 py-2 text-xs text-gray-400 transition-colors hover:bg-gray-700"
					>
						{revealed() ? "Hide" : "Show"}
					</button>
				</Show>
				<button
					onClick={() => void copy()}
					class="rounded bg-indigo-600 px-3 py-2 text-xs font-medium transition-colors hover:bg-indigo-500"
				>
					{copied() ? "Copied!" : "Copy"}
				</button>
			</div>
		</div>
	);
}

export default function IntegrationsTab(_props: RouteProps<typeof route>) {
	const [integration] = createStore<{ api_key: string }>(
		async () => await getIntegrationSettings(),
		{ api_key: "" },
	);

	const baseUrl = createMemo(() => (typeof window !== "undefined" ? window.location.origin : ""));

	return (
		<div>
			<Title>Integrations · Settings · ReadingRoom</Title>
			<h3 class="mb-4 text-lg font-semibold">Prowlarr Integration</h3>
			<p class="mb-4 text-sm text-gray-400">
				Add ReadingRoom as a <span class="text-gray-200">Readarr</span> app in Prowlarr
				(Settings → Apps) and use these values. Prowlarr will then push and manage
				ReadingRoom's indexers.
			</p>
			<Errored
				fallback={(err, reset) => (
					<p class="mt-2 text-sm text-red-400">
						Failed to load: {String(err())}{" "}
						<button onClick={reset} class="ml-1 text-indigo-400 underline">
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-sm text-gray-500">Loading...</p>}>
					<div class="max-w-md">
						{copyableRow({ label: "URL", value: baseUrl() })}
						<Show
							when={integration.api_key}
							fallback={
								<p class="text-sm text-yellow-300/80">
									No API key configured. Set{" "}
									<code class="text-xs">READINGROOM_API_KEY</code> on the server
									to enable Prowlarr sync.
								</p>
							}
						>
							{copyableRow({
								label: "API Key",
								value: integration.api_key,
								secret: true,
							})}
						</Show>
					</div>
				</Loading>
			</Errored>
		</div>
	);
}
