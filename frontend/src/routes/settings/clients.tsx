import { Title } from "@solidjs/meta";
import { useBeforeLeave, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
  action,
  createEffect,
  createOptimistic,
  createOptimisticStore,
  createSignal,
  createStore,
  Errored,
  For,
  Loading,
  Match,
  refresh,
  Show,
  Switch,
} from "solid-js";
import * as v from "valibot";

import type { DownloadClientInput } from "../../api/settings";
import type { DownloadClient, TestResult } from "../../types";

import * as settingsApi from "../../api/settings";
import { implementationLabel } from "../../components/settings/shared";
import StatusDot from "../../components/settings/StatusDot";

export const route = defineFileRoute("/settings/clients", {
  info: { label: "Download Clients" },
});

interface ClientEditForm {
  name: string;
  implementation: string;
  host: string;
  port: number;
  username: string;
  password: string;
  url_base: string;
  category: string;
  download_dir: string;
  rate_limit_kb: string;
  concurrent_downloads: string;
  priority: number;
}

interface ClientSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  url_base: string;
  category: string;
  download_dir: string;
  rate_limit?: number;
  concurrent_downloads?: number;
}

const CLIENT_SETTINGS_SCHEMA = v.object({
  host: v.optional(v.string()),
  port: v.optional(v.number()),
  username: v.optional(v.string()),
  password: v.optional(v.string()),
  url_base: v.optional(v.string()),
  category: v.optional(v.string()),
  download_dir: v.optional(v.string()),
  rate_limit: v.optional(v.number()),
  concurrent_downloads: v.optional(v.number()),
});

function parseClientSettings(settings: string): ClientSettings {
  try {
    const parsed = v.safeParse(CLIENT_SETTINGS_SCHEMA, JSON.parse(settings));
    if (!parsed.success) throw new Error("Invalid settings");
    return {
      host: parsed.output.host ?? "",
      port: parsed.output.port ?? 0,
      username: parsed.output.username ?? "",
      password: parsed.output.password ?? "",
      url_base: parsed.output.url_base ?? "",
      category: parsed.output.category ?? "",
      download_dir: parsed.output.download_dir ?? "",
      rate_limit: parsed.output.rate_limit,
      concurrent_downloads: parsed.output.concurrent_downloads,
    };
  } catch {
    return {
      host: "",
      port: 0,
      username: "",
      password: "",
      url_base: "",
      category: "",
      download_dir: "",
      rate_limit: undefined,
      concurrent_downloads: undefined,
    };
  }
}

function isBuiltinClient(client: DownloadClient): boolean {
  return client.implementation === "http" && client.name === "HTTP Direct";
}

export default function DownloadClientsTab(_props: RouteProps<typeof route>) {
  const [showAdd, setShowAdd] = createSignal(false);
  const [editingClientId, setEditingClientId] = createSignal<number | null>(null);
  const [clientEditForm, setClientEditForm] = createSignal<ClientEditForm | null>(null);
  useBeforeLeave((event) => {
    if (!clientEditForm()) return;
    event.preventDefault();
    if (window.confirm("Discard unsaved changes?")) event.retry(true);
  });
  const [clientTestResults, setClientTestResults] = createStore<Record<number, TestResult>>({});
  const [autoTested, setAutoTested] = createSignal(false);
  const [isTestingAll, setIsTestingAll] = createOptimistic(false);
  const [adding, setAdding] = createSignal(false);
  const [savingClientId, setSavingClientId] = createSignal<number | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [newName, setNewName] = createSignal("");
  const [newImpl, setNewImpl] = createSignal("transmission");
  const [newHost, setNewHost] = createSignal("");
  const [newPort, setNewPort] = createSignal<number>(0);
  const [newUsername, setNewUsername] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [newUrlBase, setNewUrlBase] = createSignal("");
  const [newCategory, setNewCategory] = createSignal("");
  const [newDownloadDir, setNewDownloadDir] = createSignal("");
  const [newRateLimit, setNewRateLimit] = createSignal("");
  const [newConcurrent, setNewConcurrent] = createSignal("");

  const [builtinTestResult, setBuiltinTestResult] = createSignal<TestResult | undefined>(undefined);
  const [savingBuiltin, setSavingBuiltin] = createSignal(false);

  const erroredClients: Record<number, DownloadClient> = {};

  const [clients, setClients] = createOptimisticStore<{
    download_clients: (DownloadClient & { error?: boolean })[];
  }>(
    async () => {
      const data = await settingsApi.listDownloadClients();
      return {
        download_clients: data.download_clients.map((c) =>
          erroredClients[c.id] ? { ...c, error: true } : c,
        ),
      };
    },
    { download_clients: [] },
  );

  const builtinClient = () => clients.download_clients.find((c) => isBuiltinClient(c));

  const [builtinForm, setBuiltinForm] = createStore(
    () => {
      const s = parseClientSettings(builtinClient() ? builtinClient()!.settings : "{}");
      const row = builtinClient();
      return {
        download_dir: s.download_dir || "./downloads",
        rate_limit_kb: s.rate_limit ? String(Math.round(s.rate_limit / 1024)) : "",
        concurrent: String(s.concurrent_downloads ?? 2),
        enabled: row ? row.enabled : true,
      };
    },
    { download_dir: "./downloads", rate_limit_kb: "", concurrent: "2", enabled: true },
  );

  const configurableClients = () => clients.download_clients.filter((c) => !isBuiltinClient(c));

  const removeClient = action(function* (client: DownloadClient) {
    setClients((s) => {
      s.download_clients = s.download_clients.filter((c) => c.id !== client.id);
    });
    try {
      yield settingsApi.removeDownloadClient(client.id);
      delete erroredClients[client.id];
    } catch {
      erroredClients[client.id] = client;
    }
    refresh(clients);
  });

  const [retryingClientId, setRetryingClientId] = createSignal<number | null>(null);

  const retryRemoveClient = action(function* (client: DownloadClient) {
    setRetryingClientId(client.id);
    try {
      yield settingsApi.removeDownloadClient(client.id);
      delete erroredClients[client.id];
    } catch {
      /* leave errored */
    } finally {
      setRetryingClientId(null);
    }
    refresh(clients);
  });

  const toggleClientEnabled = action(function* (client: DownloadClient, enabled: boolean) {
    setClients((s) => {
      s.download_clients = s.download_clients.map((c) =>
        c.id === client.id ? { ...c, enabled } : c,
      );
    });
    try {
      yield settingsApi.setDownloadClientEnabled(client.id, enabled);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
    refresh(clients);
  });

  const addClient = action(async function* () {
    setAdding(true);
    setActionError(null);
    try {
      await settingsApi.addDownloadClient({
        name: newName(),
        implementation: newImpl(),
        host: newHost(),
        port: newPort(),
        username: newUsername(),
        password: newPassword(),
        url_base: newUrlBase(),
        category: newCategory(),
        download_dir: newDownloadDir(),
        rate_limit:
          newImpl() === "http" && newRateLimit()
            ? Math.round(Number(newRateLimit()) * 1024)
            : undefined,
        concurrent_downloads:
          newImpl() === "http" && newConcurrent() ? Number(newConcurrent()) : undefined,
        enabled: true,
      });
      yield;
      refresh(clients);
      setShowAdd(false);
      setNewName("");
      setNewImpl("transmission");
      setNewHost("");
      setNewPort(0);
      setNewUsername("");
      setNewPassword("");
      setNewUrlBase("");
      setNewCategory("");
      setNewDownloadDir("");
      setNewRateLimit("");
      setNewConcurrent("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAdding(false);
    }
  });

  const updateClient = action(async function* (id: number, form: ClientEditForm) {
    setSavingClientId(id);
    try {
      await settingsApi.updateDownloadClient(id, {
        name: form.name,
        implementation: form.implementation,
        host: form.host,
        port: form.port,
        username: form.username,
        password: form.password,
        url_base: form.url_base,
        category: form.category,
        download_dir: form.download_dir,
        rate_limit: form.rate_limit_kb ? Math.round(Number(form.rate_limit_kb) * 1024) : undefined,
        concurrent_downloads: form.concurrent_downloads
          ? Number(form.concurrent_downloads)
          : undefined,
      });
      yield;
      refresh(clients);
      setEditingClientId(null);
      setClientEditForm(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSavingClientId(null);
    }
  });

  const builtinInput = (): DownloadClientInput => ({
    name: "HTTP Direct",
    implementation: "http",
    host: "",
    port: 0,
    username: "",
    password: "",
    url_base: "",
    category: "",
    download_dir: builtinForm.download_dir,
    rate_limit: builtinForm.rate_limit_kb
      ? Math.round(Number(builtinForm.rate_limit_kb) * 1024)
      : undefined,
    concurrent_downloads: builtinForm.concurrent ? Number(builtinForm.concurrent) : undefined,
    enabled: builtinForm.enabled,
  });

  const saveBuiltinClient = action(async function* () {
    setSavingBuiltin(true);
    setActionError(null);
    try {
      const input = builtinInput();
      const row = builtinClient();
      if (row) {
        await settingsApi.updateDownloadClient(row.id, input);
      } else {
        await settingsApi.addDownloadClient(input);
      }
      yield;
      refresh(clients);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSavingBuiltin(false);
    }
  });

  const toggleBuiltinEnabled = action(async function* (enabled: boolean) {
    setBuiltinForm((f) => {
      f.enabled = enabled;
    });
    setActionError(null);
    try {
      const row = builtinClient();
      if (row) {
        yield settingsApi.setDownloadClientEnabled(row.id, enabled);
      } else {
        const input = builtinInput();
        yield settingsApi.addDownloadClient({ ...input, enabled });
      }
      yield;
      refresh(clients);
    } catch (err) {
      setBuiltinForm((f) => {
        f.enabled = !enabled;
      });
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  const testClient: (id: number) => Promise<void> = async (id: number) => {
    setClientTestResults((r) => {
      r[id] = { status: "testing" };
    });
    try {
      const data = await settingsApi.testDownloadClient(id);
      setClientTestResults((r) => {
        r[id] = {
          status: data.success ? "success" : "error",
          message: data.message,
          version: data.version,
          default_save_path: data.default_save_path,
        };
      });
    } catch (err) {
      setClientTestResults((r) => {
        r[id] = { status: "error", message: err instanceof Error ? err.message : "Test failed" };
      });
    }
  };

  const testBuiltinClient = async () => {
    setBuiltinTestResult({ status: "testing" });
    try {
      const row = builtinClient();
      let id: number;
      if (row) {
        id = row.id;
      } else {
        const created = await settingsApi.addDownloadClient(builtinInput());
        id = created.id;
        refresh(clients);
      }
      const data = await settingsApi.testDownloadClient(id);
      setBuiltinTestResult({
        status: data.success ? "success" : "error",
        message: data.message,
        version: data.version,
        default_save_path: data.default_save_path,
      });
    } catch (err) {
      setBuiltinTestResult({
        status: "error",
        message: err instanceof Error ? err.message : "Test failed",
      });
    }
  };

  createEffect(
    () => configurableClients(),
    (list) => {
      if (!autoTested() && list.length > 0) {
        setAutoTested(true);
        const timers = list.map((cl, i) => setTimeout(() => void testClient(cl.id), i * 300));
        return () => timers.forEach(clearTimeout);
      }
    },
  );

  const testAllClients = action(function* () {
    setIsTestingAll(true);
    const list = configurableClients();
    if (list.length === 0) return;
    const runTest = testClient;
    for (const cl of list) {
      try {
        yield runTest(cl.id);
      } catch {
        /* handled inside */
      }
      yield new Promise((r) => setTimeout(r, 200));
    }
  });

  return (
    <div>
      <Title>Download Clients · Settings · ReadingRoom</Title>
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
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
          <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 class="text-lg font-semibold">Download Clients</h3>
            <div class="flex gap-2">
              <Show when={configurableClients().length > 0}>
                <button
                  onClick={() => void testAllClients()}
                  disabled={isTestingAll()}
                  class="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                >
                  {isTestingAll() ? "Testing All..." : "Test All"}
                </button>
              </Show>
              <button
                onClick={() => setShowAdd(!showAdd())}
                class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
              >
                {showAdd() ? "Cancel" : "Add Client"}
              </button>
            </div>
          </div>

          <Show when={actionError()}>
            <p class="text-sm text-red-400 mt-2">{actionError()}</p>
          </Show>

          <div class="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div class="flex items-center gap-2">
                <StatusDot status={builtinTestResult()?.status ?? "idle"} />
                <h4 class="font-medium">HTTP (Direct)</h4>
                <span class="text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded px-1.5 py-0.5">
                  Built-in
                </span>
                <Show when={builtinTestResult()?.status === "success"}>
                  <span class="text-xs bg-green-900/40 text-green-400 border border-green-800 rounded px-1.5 py-0.5">
                    Connected
                  </span>
                </Show>
                <Show when={builtinTestResult()?.status === "error"}>
                  <span class="text-xs bg-red-900/40 text-red-400 border border-red-800 rounded px-1.5 py-0.5">
                    Disconnected
                  </span>
                </Show>
              </div>
              <button
                onClick={() => void toggleBuiltinEnabled(!builtinForm.enabled)}
                class={[
                  "px-3 py-1.5 rounded text-sm transition-colors",
                  builtinForm.enabled
                    ? "bg-green-700 hover:bg-green-600"
                    : "bg-gray-700 hover:bg-gray-600",
                ]}
              >
                {builtinForm.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs text-gray-400 mb-1">Download Directory</label>
                <input
                  value={builtinForm.download_dir}
                  onInput={(e) =>
                    setBuiltinForm((f) => {
                      f.download_dir = e.currentTarget.value;
                    })
                  }
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                  placeholder="./downloads"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1">Rate Limit (KB/s)</label>
                <input
                  type="number"
                  value={builtinForm.rate_limit_kb}
                  onInput={(e) =>
                    setBuiltinForm((f) => {
                      f.rate_limit_kb = e.currentTarget.value;
                    })
                  }
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1">Concurrent Downloads</label>
                <input
                  type="number"
                  value={builtinForm.concurrent}
                  onInput={(e) =>
                    setBuiltinForm((f) => {
                      f.concurrent = e.currentTarget.value;
                    })
                  }
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                  placeholder="2"
                />
              </div>
            </div>
            <Show when={builtinTestResult()?.status === "success"}>
              <p class="text-xs text-green-400 mt-2">
                ✓ Connected
                <Show when={builtinTestResult()?.version}> · v{builtinTestResult()?.version}</Show>
                <Show when={builtinTestResult()?.default_save_path}>
                  {" "}
                  · {builtinTestResult()?.default_save_path}
                </Show>
              </p>
            </Show>
            <Show when={builtinTestResult()?.status === "error"}>
              <p class="text-xs text-red-400 mt-2">✗ {builtinTestResult()?.message}</p>
            </Show>
            <div class="flex gap-3 items-center mt-3">
              <button
                onClick={() => void saveBuiltinClient()}
                disabled={savingBuiltin()}
                class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => void testBuiltinClient()}
                disabled={builtinTestResult()?.status === "testing"}
                class="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 rounded text-sm transition-colors"
              >
                {builtinTestResult()?.status === "testing" ? "Testing..." : "Test"}
              </button>
              <p class="text-xs text-gray-500">
                The built-in HTTP downloader streams release URLs to disk.
              </p>
            </div>
          </div>

          <Show when={showAdd()}>
            <div class="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    value={newName()}
                    onInput={(e) => setNewName(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="My Download Client"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Type</label>
                  <select
                    value={newImpl()}
                    onChange={(e) => setNewImpl(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                  >
                    <option value="transmission">Transmission</option>
                    <option value="qbittorrent">qBittorrent</option>
                    <option value="deluge">Deluge</option>
                    <option value="http">HTTP (Direct)</option>
                  </select>
                </div>
                <Show when={newImpl() !== "http"}>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Host</label>
                    <input
                      value={newHost()}
                      onInput={(e) => setNewHost(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="localhost"
                    />
                  </div>
                </Show>
                <Show when={newImpl() !== "http"}>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Port</label>
                    <input
                      type="number"
                      value={newPort()}
                      onInput={(e) => setNewPort(Number(e.currentTarget.value))}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="9091"
                    />
                  </div>
                </Show>
                <Show when={newImpl() !== "http"}>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Username</label>
                    <input
                      value={newUsername()}
                      onInput={(e) => setNewUsername(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="Optional"
                    />
                  </div>
                </Show>
                <Show when={newImpl() !== "http"}>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Password</label>
                    <input
                      type="password"
                      value={newPassword()}
                      onInput={(e) => setNewPassword(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="Optional"
                    />
                  </div>
                </Show>
                <Show when={newImpl() !== "http"}>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">URL Base</label>
                    <input
                      value={newUrlBase()}
                      onInput={(e) => setNewUrlBase(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="/transmission/"
                    />
                  </div>
                </Show>
                <Show when={newImpl() !== "http"}>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Category</label>
                    <input
                      value={newCategory()}
                      onInput={(e) => setNewCategory(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="books"
                    />
                  </div>
                </Show>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Download Directory</label>
                  <input
                    value={newDownloadDir()}
                    onInput={(e) => setNewDownloadDir(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="./downloads"
                  />
                </div>
                <Show when={newImpl() === "http"}>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Rate Limit (KB/s)</label>
                    <input
                      type="number"
                      value={newRateLimit()}
                      onInput={(e) => setNewRateLimit(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="Unlimited"
                    />
                  </div>
                </Show>
                <Show when={newImpl() === "http"}>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Concurrent Downloads</label>
                    <input
                      type="number"
                      value={newConcurrent()}
                      onInput={(e) => setNewConcurrent(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="2"
                    />
                  </div>
                </Show>
              </div>
              <div class="flex gap-3 items-center mt-4">
                <button
                  onClick={() => void addClient()}
                  disabled={adding() || !newName() || (newImpl() !== "http" && !newHost().trim())}
                  class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                >
                  Cancel
                </button>
                <p class="text-xs text-gray-500">
                  {newImpl() === "http"
                    ? "The download URL is fetched directly."
                    : "A host is required to connect."}
                </p>
              </div>
            </div>
          </Show>

          <Show
            when={configurableClients().length > 0}
            fallback={<p class="text-gray-500 text-sm">No download clients configured.</p>}
          >
            <div class="space-y-2">
              <For each={configurableClients()}>
                {(client) => (
                  <Show
                    when={editingClientId() === client.id}
                    fallback={
                      <div
                        class={[
                          "flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-900 rounded-lg border transition-colors",
                          { "border-red-800": !!client.error, "border-gray-800": !client.error },
                        ]}
                      >
                        <StatusDot status={clientTestResults[client.id]?.status ?? "idle"} />
                        <div class="flex-1 min-w-0">
                          <p class="font-medium truncate">
                            <span class={client.enabled ? "" : "text-gray-500"}>{client.name}</span>
                            {!client.enabled && (
                              <span class="ml-2 text-xs text-gray-500">Disabled</span>
                            )}
                          </p>
                          <p class="text-xs text-gray-400">
                            {implementationLabel(client.implementation)}
                            <Show
                              when={
                                client.implementation === "http"
                                  ? parseClientSettings(client.settings).download_dir
                                  : parseClientSettings(client.settings).host
                              }
                            >
                              {" · "}
                              <Switch>
                                <Match when={client.implementation === "http"}>
                                  {parseClientSettings(client.settings).download_dir}
                                </Match>
                                <Match when={client.implementation !== "http"}>
                                  {parseClientSettings(client.settings).host}
                                  <Show when={parseClientSettings(client.settings).port}>
                                    :{parseClientSettings(client.settings).port}
                                  </Show>
                                </Match>
                              </Switch>
                            </Show>
                            <Show when={clientTestResults[client.id]}>
                              <Switch>
                                <Match when={clientTestResults[client.id]?.status === "success"}>
                                  <span class="ml-1.5 text-xs bg-green-900/40 text-green-400 border border-green-800 rounded px-1.5 py-0.5">
                                    Connected
                                  </span>
                                </Match>
                                <Match when={clientTestResults[client.id]?.status === "error"}>
                                  <span class="ml-1.5 text-xs bg-red-900/40 text-red-400 border border-red-800 rounded px-1.5 py-0.5">
                                    Disconnected
                                  </span>
                                </Match>
                              </Switch>
                            </Show>
                          </p>
                          <Show when={clientTestResults[client.id]?.status === "success"}>
                            <p class="text-xs text-green-400 mt-1">
                              ✓ Connected
                              <Show when={clientTestResults[client.id]?.version}>
                                {" "}
                                · v{clientTestResults[client.id]?.version}
                              </Show>
                              <Show when={clientTestResults[client.id]?.default_save_path}>
                                {" "}
                                · {clientTestResults[client.id]?.default_save_path}
                              </Show>
                            </p>
                          </Show>
                          <Show when={clientTestResults[client.id]?.status === "error"}>
                            <p class="text-xs text-red-400 mt-1">
                              ✗ {clientTestResults[client.id]?.message}
                            </p>
                          </Show>
                          <Show when={client.error}>
                            <p class="text-xs text-red-400 mt-1">Failed to remove — click Retry</p>
                          </Show>
                        </div>
                        <div class="flex flex-wrap gap-2 shrink-0">
                          <button
                            onClick={() => void toggleClientEnabled(client, !client.enabled)}
                            class={[
                              "px-2 py-1 rounded text-xs transition-colors",
                              client.enabled
                                ? "bg-green-700 hover:bg-green-600"
                                : "bg-gray-700 hover:bg-gray-600",
                            ]}
                          >
                            {client.enabled ? "Enabled" : "Disabled"}
                          </button>
                          <button
                            onClick={() => {
                              const parsed = parseClientSettings(client.settings);
                              setEditingClientId(client.id);
                              setClientEditForm({
                                name: client.name,
                                implementation: client.implementation,
                                ...parsed,
                                rate_limit_kb: parsed.rate_limit
                                  ? String(Math.round(parsed.rate_limit / 1024))
                                  : "",
                                concurrent_downloads: parsed.concurrent_downloads
                                  ? String(parsed.concurrent_downloads)
                                  : "",
                                priority: client.priority,
                              });
                            }}
                            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void testClient(client.id)}
                            disabled={clientTestResults[client.id]?.status === "testing"}
                            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
                          >
                            {clientTestResults[client.id]?.status === "testing"
                              ? "Testing..."
                              : "Test"}
                          </button>
                          <Show
                            when={client.error}
                            fallback={
                              <button
                                onClick={() => void removeClient(client)}
                                class="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
                              >
                                Remove
                              </button>
                            }
                          >
                            <button
                              onClick={() => void retryRemoveClient(client)}
                              disabled={retryingClientId() === client.id}
                              class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
                            >
                              {retryingClientId() === client.id ? "Retrying..." : "Retry"}
                            </button>
                          </Show>
                        </div>
                      </div>
                    }
                  >
                    <div class="p-3 bg-gray-900 rounded-lg border border-gray-800">
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label class="block text-xs text-gray-400 mb-1">Name</label>
                          <input
                            value={clientEditForm()?.name ?? ""}
                            onInput={(e) =>
                              setClientEditForm((prev) =>
                                prev ? { ...prev, name: e.currentTarget.value } : null,
                              )
                            }
                            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                          />
                        </div>
                        <div>
                          <label class="block text-xs text-gray-400 mb-1">Type</label>
                          <select
                            value={clientEditForm()?.implementation ?? "transmission"}
                            onChange={(e) =>
                              setClientEditForm((prev) =>
                                prev ? { ...prev, implementation: e.currentTarget.value } : null,
                              )
                            }
                            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                          >
                            <option value="transmission">Transmission</option>
                            <option value="qbittorrent">qBittorrent</option>
                            <option value="deluge">Deluge</option>
                            <option value="http">HTTP (Direct)</option>
                          </select>
                        </div>
                        <Show when={clientEditForm()?.implementation !== "http"}>
                          <div>
                            <label class="block text-xs text-gray-400 mb-1">Host</label>
                            <input
                              value={clientEditForm()?.host ?? ""}
                              onInput={(e) =>
                                setClientEditForm((prev) =>
                                  prev ? { ...prev, host: e.currentTarget.value } : null,
                                )
                              }
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                            />
                          </div>
                        </Show>
                        <Show when={clientEditForm()?.implementation !== "http"}>
                          <div>
                            <label class="block text-xs text-gray-400 mb-1">Port</label>
                            <input
                              type="number"
                              value={clientEditForm()?.port ?? 0}
                              onInput={(e) =>
                                setClientEditForm((prev) =>
                                  prev ? { ...prev, port: Number(e.currentTarget.value) } : null,
                                )
                              }
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                            />
                          </div>
                        </Show>
                        <Show when={clientEditForm()?.implementation !== "http"}>
                          <div>
                            <label class="block text-xs text-gray-400 mb-1">Username</label>
                            <input
                              value={clientEditForm()?.username ?? ""}
                              onInput={(e) =>
                                setClientEditForm((prev) =>
                                  prev ? { ...prev, username: e.currentTarget.value } : null,
                                )
                              }
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                              placeholder="Optional"
                            />
                          </div>
                        </Show>
                        <Show when={clientEditForm()?.implementation !== "http"}>
                          <div>
                            <label class="block text-xs text-gray-400 mb-1">Password</label>
                            <input
                              type="password"
                              value={clientEditForm()?.password ?? ""}
                              onInput={(e) =>
                                setClientEditForm((prev) =>
                                  prev ? { ...prev, password: e.currentTarget.value } : null,
                                )
                              }
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                              placeholder="Optional"
                            />
                          </div>
                        </Show>
                        <Show when={clientEditForm()?.implementation !== "http"}>
                          <div>
                            <label class="block text-xs text-gray-400 mb-1">URL Base</label>
                            <input
                              value={clientEditForm()?.url_base ?? ""}
                              onInput={(e) =>
                                setClientEditForm((prev) =>
                                  prev ? { ...prev, url_base: e.currentTarget.value } : null,
                                )
                              }
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                              placeholder="/transmission/"
                            />
                          </div>
                        </Show>
                        <Show when={clientEditForm()?.implementation !== "http"}>
                          <div>
                            <label class="block text-xs text-gray-400 mb-1">Category</label>
                            <input
                              value={clientEditForm()?.category ?? ""}
                              onInput={(e) =>
                                setClientEditForm((prev) =>
                                  prev ? { ...prev, category: e.currentTarget.value } : null,
                                )
                              }
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                              placeholder="books"
                            />
                          </div>
                        </Show>
                        <div>
                          <label class="block text-xs text-gray-400 mb-1">Download Directory</label>
                          <input
                            value={clientEditForm()?.download_dir ?? ""}
                            onInput={(e) =>
                              setClientEditForm((prev) =>
                                prev ? { ...prev, download_dir: e.currentTarget.value } : null,
                              )
                            }
                            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                            placeholder="./downloads"
                          />
                        </div>
                        <Show when={clientEditForm()?.implementation === "http"}>
                          <div>
                            <label class="block text-xs text-gray-400 mb-1">
                              Rate Limit (KB/s)
                            </label>
                            <input
                              type="number"
                              value={clientEditForm()?.rate_limit_kb ?? ""}
                              onInput={(e) =>
                                setClientEditForm((prev) =>
                                  prev ? { ...prev, rate_limit_kb: e.currentTarget.value } : null,
                                )
                              }
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                              placeholder="Unlimited"
                            />
                          </div>
                        </Show>
                        <Show when={clientEditForm()?.implementation === "http"}>
                          <div>
                            <label class="block text-xs text-gray-400 mb-1">
                              Concurrent Downloads
                            </label>
                            <input
                              type="number"
                              value={clientEditForm()?.concurrent_downloads ?? ""}
                              onInput={(e) =>
                                setClientEditForm((prev) =>
                                  prev
                                    ? { ...prev, concurrent_downloads: e.currentTarget.value }
                                    : null,
                                )
                              }
                              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                              placeholder="2"
                            />
                          </div>
                        </Show>
                      </div>
                      <div class="flex gap-2 mt-3 justify-end">
                        <button
                          onClick={() => {
                            setEditingClientId(null);
                            setClientEditForm(null);
                          }}
                          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (clientEditForm()) {
                              void updateClient(client.id, clientEditForm()!);
                            }
                          }}
                          disabled={savingClientId() === client.id || !clientEditForm()?.name}
                          class="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </Show>
                )}
              </For>
            </div>
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}
