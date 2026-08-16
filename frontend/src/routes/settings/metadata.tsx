import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { Errored, Show, createMemo, createSignal, onSettled } from "solid-js";

import type { CacheMeta, ImportCounts, MetadataStatus } from "../../api/settings";

import * as settingsApi from "../../api/settings";

export const route = defineFileRoute("/settings/metadata", {
  info: { label: "Metadata" },
});

const DEFAULT_DUMP_URL = "https://openlibrary.org/data/ol_dump_all_latest.txt.gz";

const DEFAULT_RESPONSE: settingsApi.MetadataSettingsResponse = {
  success: true,
  mode: "online",
  auto_update: true,
  dump_url: DEFAULT_DUMP_URL,
  offline_ready: false,
  status: {
    state: "Idle",
    bytes_downloaded: 0,
    total_bytes: null,
    import_bytes: 0,
    rows: 0,
    counts: { works: 0, editions: 0, authors: 0, redirects: 0 },
    started_at: null,
  },
  stats: {
    counts: { works: 0, editions: 0, authors: 0, redirects: 0 },
    meta: { imported_at: null, last_status: null, last_error: null, last_attempt: null },
  },
};

function fmtBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function StatusCard(props: {
  status: MetadataStatus;
  meta: CacheMeta | null;
  counts: ImportCounts | null;
  ready: boolean;
}) {
  const state = () => props.status.state;
  const running = () => state() === "Downloading" || state() === "Importing";
  const liveFailed = () => state().startsWith("Failed");
  const persistedFailed = () => !running() && !liveFailed() && props.meta?.last_status === "failed";
  const hasData = () => (props.counts?.works ?? 0) + (props.counts?.editions ?? 0) > 0;

  const phaseBytes = () =>
    state() === "Importing" ? props.status.import_bytes : props.status.bytes_downloaded;
  const pct = () => {
    const total = props.status.total_bytes ?? 0;
    if (total <= 0) return 0;
    return Math.min(100, Math.round((phaseBytes() / total) * 100));
  };
  const failed = () => liveFailed() || persistedFailed();

  const label = () => {
    if (failed()) return "Failed";
    if (state() === "Downloading") return "Fetching dump";
    if (state() === "Importing") return "Importing dump";
    if (state() === "Done" || hasData()) return "Ready";
    return "Not downloaded yet";
  };

  const badgeClass = () => {
    if (failed()) return "bg-red-900/40 text-red-400 border border-red-800";
    if (running()) return "bg-indigo-900/40 text-indigo-300 border border-indigo-800";
    if (state() === "Done" || hasData())
      return "bg-green-900/40 text-green-400 border border-green-800";
    return "bg-gray-800 text-gray-400 border border-gray-700";
  };

  const errorMessage = () => (liveFailed() ? state() : (props.meta?.last_error ?? "Import failed"));

  return (
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-semibold text-gray-200">Local dump cache</h4>
        <span class={["px-2 py-1 rounded text-xs font-medium", badgeClass()]}>{label()}</span>
      </div>

      <Show when={failed()}>
        <p class="text-sm text-red-400 mb-2 break-all">{errorMessage()}</p>
        <Show when={persistedFailed() && props.meta?.last_attempt}>
          <p class="text-xs text-gray-500 mb-2">
            Last attempt: {fmtDate(props.meta?.last_attempt ?? null)}
          </p>
        </Show>
      </Show>

      <Show when={running()}>
        <div class="mb-3">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>
              {fmtBytes(phaseBytes())}
              {props.status.total_bytes
                ? ` / ${fmtBytes(props.status.total_bytes)} (${pct()}%)`
                : ""}
            </span>
            <Show when={state() === "Importing"}>
              <span>{props.status.rows.toLocaleString()} rows</span>
            </Show>
          </div>
          <div class="w-full bg-gray-800 rounded h-2">
            <div class="bg-indigo-500 h-2 rounded transition-all" style={{ width: `${pct()}%` }} />
          </div>
        </div>
      </Show>

      <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <dt class="text-gray-500 text-xs">Works</dt>
          <dd class="font-medium">{(props.counts?.works ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt class="text-gray-500 text-xs">Editions</dt>
          <dd class="font-medium">{(props.counts?.editions ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt class="text-gray-500 text-xs">Authors</dt>
          <dd class="font-medium">{(props.counts?.authors ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt class="text-gray-500 text-xs">Redirects</dt>
          <dd class="font-medium">{(props.counts?.redirects ?? 0).toLocaleString()}</dd>
        </div>
      </dl>

      <div class="mt-3 text-xs text-gray-500">
        Dump imported: {fmtDate(props.meta?.imported_at ?? null)}
        {props.ready && !running() ? " · Offline lookups available" : ""}
      </div>
    </div>
  );
}

export default function MetadataTab(_props: RouteProps<typeof route>) {
  // Settings + status are a single derived async value. A tick signal re-reads
  // the source when a download/import is in flight (see onSettled below).
  const [tick, setTick] = createSignal(0);
  const data = createMemo(
    async () => {
      tick();
      return settingsApi.getMetadataSettings();
    },
    { loadingValue: DEFAULT_RESPONSE },
  );
  const running = createMemo(() => {
    const s = data().status.state;
    return s === "Downloading" || s === "Importing";
  });
  // Writable derived signal: server value with a local edit override.
  const [dumpUrl, setDumpUrl] = createSignal(() => data().dump_url);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  onSettled(() => {
    const poll = setInterval(() => {
      if (running()) setTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(poll);
  });

  const refresh = () => setTick((t) => t + 1);

  const save = async (body: {
    mode?: "online" | "offline";
    auto_update?: boolean;
    dump_url?: string;
  }) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await settingsApi.updateMetadataSettings(body);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  const runDownload = async () => {
    setError(null);
    setNotice(null);
    try {
      const res = await settingsApi.triggerMetadataDownload();
      if (!res.started) setError("A download/import is already running.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const runCheck = async () => {
    setError(null);
    setNotice(null);
    try {
      const res = await settingsApi.checkMetadataUpdates();
      refresh();
      if (res.check.newer) {
        if (!res.check.started) setError("A newer dump exists but a download is already running.");
      } else {
        setNotice("Cache is up to date.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  return (
    <div class="space-y-6">
      <Errored
        fallback={(err, reset) => (
          <p class="text-sm text-red-400">
            Failed to load: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h4 class="font-semibold text-gray-200 mb-1">Metadata source</h4>
          <p class="text-sm text-gray-500 mb-4">
            Use the OpenLibrary website API, or a local offline cache built from the full{" "}
            <code class="text-gray-400">ol_dump_all_latest.txt.gz</code> dump (~12 GB compressed).
            Enabling the local cache downloads and imports the dump in the background.
          </p>

          <div class="flex flex-col sm:flex-row gap-6">
            <label class="flex items-center gap-3">
              <input
                type="checkbox"
                checked={data().mode === "offline"}
                onChange={(e) =>
                  void save({ mode: e.currentTarget.checked ? "offline" : "online" })
                }
                disabled={saving()}
                class="w-4 h-4 rounded"
              />
              <span class="text-sm">
                Local cache (offline) metadata source
                <span class="block text-xs text-gray-500">
                  {data().mode === "offline"
                    ? "Disabled the online API; uses the dump cache."
                    : "Uses the online OpenLibrary API."}
                </span>
              </span>
            </label>

            <label class="flex items-center gap-3">
              <input
                type="checkbox"
                checked={data().auto_update}
                onChange={(e) => void save({ auto_update: e.currentTarget.checked })}
                disabled={saving()}
                class="w-4 h-4 rounded"
              />
              <span class="text-sm">
                Check periodically for a newer dump
                <span class="block text-xs text-gray-500">
                  Re-imports automatically when a new dump is published.
                </span>
              </span>
            </label>
          </div>

          <div class="mt-4">
            <label for="metadata-dump-url" class="block text-sm text-gray-400 mb-1">
              Dump URL
            </label>
            <div class="flex flex-col sm:flex-row gap-2">
              <input
                id="metadata-dump-url"
                name="dump_url"
                type="text"
                value={dumpUrl()}
                onInput={(e) => setDumpUrl(e.currentTarget.value)}
                class="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => void save({ dump_url: dumpUrl() })}
                disabled={saving() || dumpUrl() === data().dump_url}
                class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded text-sm font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        <StatusCard
          status={data().status}
          meta={data().stats?.meta ?? null}
          counts={data().stats?.counts ?? null}
          ready={data().offline_ready}
        />

        <Show when={error()}>
          <p class="text-sm text-red-400">{error()}</p>
        </Show>
        <Show when={notice()}>
          <p class="text-sm text-gray-400">{notice()}</p>
        </Show>

        <div class="flex gap-3">
          <button
            onClick={() => void runDownload()}
            disabled={saving()}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Download / Re-import now
          </button>
          <button
            onClick={() => void runCheck()}
            disabled={saving()}
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg text-sm font-medium transition-colors"
          >
            Check for updates
          </button>
        </div>
      </Errored>
    </div>
  );
}
