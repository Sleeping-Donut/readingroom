import { Title } from "@solidjs/meta";
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, createSignal, createStore, Errored, Loading, Show } from "solid-js";

import { getIntegrationSettings } from "../../api/settings";

export const route = defineFileRoute("/settings/integrations", {
  info: { label: "Integrations" },
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
      <label class="block text-xs text-gray-400 mb-1">{props.label}</label>
      <div class="flex items-center gap-2">
        <input
          type={props.secret && !revealed() ? "password" : "text"}
          readonly
          value={props.value}
          placeholder={props.placeholder ?? ""}
          class="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm font-mono text-gray-200"
        />
        <Show when={props.secret}>
          <button
            onClick={() => setRevealed(!revealed())}
            class="px-2 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-400 transition-colors"
          >
            {revealed() ? "Hide" : "Show"}
          </button>
        </Show>
        <button
          onClick={() => void copy()}
          class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-medium transition-colors"
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
      <h3 class="text-lg font-semibold mb-4">Prowlarr Integration</h3>
      <p class="text-sm text-gray-400 mb-4">
        Add ReadingRoom as a <span class="text-gray-200">Readarr</span> app in Prowlarr (Settings →
        Apps) and use these values. Prowlarr will then push and manage ReadingRoom's indexers.
      </p>
      <Errored
        fallback={(err, reset) => (
          <p class="text-sm text-red-400 mt-2">
            Failed to load: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <Loading fallback={<p class="text-gray-500 text-sm">Loading...</p>}>
          <div class="max-w-md">
            {copyableRow({ label: "URL", value: baseUrl() })}
            <Show
              when={integration.api_key}
              fallback={
                <p class="text-sm text-yellow-300/80">
                  No API key configured. Set <code class="text-xs">READINGROOM_API_KEY</code> on the
                  server to enable Prowlarr sync.
                </p>
              }
            >
              {copyableRow({ label: "API Key", value: integration.api_key, secret: true })}
            </Show>
          </div>
        </Loading>
      </Errored>
    </div>
  );
}
