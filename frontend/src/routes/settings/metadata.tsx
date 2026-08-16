import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { Show, createEffect, createSignal, Errored, Loading } from "solid-js";

import type { ImportCounts, MetadataStatus } from "../../api/settings";

import * as settingsApi from "../../api/settings";

export const route = defineFileRoute("/settings/metadata", {
  info: { label: "Metadata" },
});

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

const STATE_LABEL: Record<string, string> = {
  Idle: "Idle",
  Downloading: "Downloading dump",
  Importing: "Importing dump",
  Done: "Complete",
};

function StatusCard(props: {
  status: MetadataStatus;
  ready: boolean;
  importedAt: string | null;
  counts: ImportCounts | null;
}) {
  const running = () => props.status.state === "Downloading" || props.status.state === "Importing";
  const pct = () =>
    props.status.total_bytes && props.status.total_bytes > 0
      ? Math.min(100, Math.round((props.status.bytes_downloaded / props.status.total_bytes) * 100))
      : 0;

  return (
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-semibold text-gray-200">Local dump cache</h4>
        <Show
          when={props.status.state !== "Done"}
          fallback={
            <span class="px-2 py-1 bg-green-900/40 text-green-400 border border-green-800 rounded text-xs font-medium">
              Ready
            </span>
          }
        >
          <span class="px-2 py-1 bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded text-xs font-medium">
            {STATE_LABEL[props.status.state] ?? props.status.state}
          </span>
        </Show>
      </div>

      <Show when={props.status.state === "Failed("}>
        <p class="text-sm text-red-400 mb-2">{props.status.state}</p>
      </Show>

      <Show when={running()}>
        <div class="mb-3">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>
              {fmtBytes(props.status.bytes_downloaded)}
              {props.status.total_bytes
                ? ` / ${fmtBytes(props.status.total_bytes)} (${pct()}%)`
                : ""}
            </span>
            <span>{props.status.rows.toLocaleString()} rows</span>
          </div>
          <div class="w-full bg-gray-800 rounded h-2">
            <div
              class="bg-indigo-500 h-2 rounded transition-all"
              style={{ width: `${props.status.state === "Importing" ? 100 : pct()}%` }}
            />
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
        Dump imported: {fmtDate(props.importedAt)}
        {props.ready && !running() ? " · Offline lookups available" : ""}
      </div>
    </div>
  );
}

export default function MetadataTab(_props: RouteProps<typeof route>) {
  const [data, setData] = createSignal<settingsApi.MetadataSettingsResponse | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [dumpUrl, setDumpUrl] = createSignal("");

  const refresh = async () => {
    const res = await settingsApi.getMetadataSettings();
    setData(res);
    if (res.dump_url) setDumpUrl(res.dump_url);
  };

  createEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  });

  // Poll while a download/import is in flight.
  createEffect(() => {
    const state = data()?.status.state;
    if (state !== "Downloading" && state !== "Importing") return;
    const t = setInterval(() => {
      void settingsApi
        .getMetadataSettings()
        .then(setData)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  });

  const save = async (body: {
    mode?: "online" | "offline";
    auto_update?: boolean;
    dump_url?: string;
  }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await settingsApi.updateMetadataSettings(body);
      setData(res);
      if (res.dump_url) setDumpUrl(res.dump_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  const runDownload = async () => {
    setError(null);
    try {
      const res = await settingsApi.triggerMetadataDownload();
      if (!res.started) setError("A download/import is already running.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const runCheck = async () => {
    setError(null);
    try {
      const res = await settingsApi.checkMetadataUpdates();
      if (res.check.newer) {
        if (!res.check.started) setError("A newer dump exists but a download is already running.");
        await refresh();
      } else {
        setError("Cache is up to date.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const mode = () => data()?.mode ?? "online";

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
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
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
                  checked={mode() === "offline"}
                  onChange={(e) =>
                    void save({ mode: e.currentTarget.checked ? "offline" : "online" })
                  }
                  disabled={saving()}
                  class="w-4 h-4 rounded"
                />
                <span class="text-sm">
                  Local cache (offline) metadata source
                  <span class="block text-xs text-gray-500">
                    {mode() === "offline"
                      ? "Disabled the online API; uses the dump cache."
                      : "Uses the online OpenLibrary API."}
                  </span>
                </span>
              </label>

              <label class="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={data()?.auto_update ?? true}
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
              <label class="block text-sm text-gray-400 mb-1">Dump URL</label>
              <div class="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={dumpUrl()}
                  onInput={(e) => setDumpUrl(e.currentTarget.value)}
                  class="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() => void save({ dump_url: dumpUrl() })}
                  disabled={saving() || dumpUrl() === data()?.dump_url}
                  class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 rounded text-sm font-medium transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>

          <StatusCard
            status={
              data()?.status ?? {
                state: "Idle",
                bytes_downloaded: 0,
                total_bytes: null,
                rows: 0,
                counts: { works: 0, editions: 0, authors: 0, redirects: 0 },
                started_at: null,
              }
            }
            ready={data()?.offline_ready ?? false}
            importedAt={data()?.stats?.dump_imported_at ?? null}
            counts={data()?.stats?.counts ?? null}
          />

          <Show when={error()}>
            <p class="text-sm text-red-400">{error()}</p>
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
        </Loading>
      </Errored>
    </div>
  );
}
