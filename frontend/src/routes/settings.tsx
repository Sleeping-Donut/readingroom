import {
  action,
  createEffect,
  createMemo,
  createOptimistic,
  createOptimisticStore,
  createSignal,
  createStore,
  Errored,
  For,
  Loading,
  Match,
  refresh,
  resolve,
  Show,
  Switch,
} from "solid-js";
import { useBeforeLeave } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { api } from "../api/client";
import { user, authEnabled, changePassword } from "../api/auth";
import type { Indexer, DownloadClient, Notification } from "../types";

interface TestResult {
  status: "idle" | "testing" | "success" | "error";
  message?: string;
  version?: string;
  default_save_path?: string;
}

function StatusDot(props: { status: string }) {
  return (
    <span
      class={[
        "inline-block w-2.5 h-2.5 rounded-full shrink-0",
        { "animate-pulse": props.status === "testing" },
      ]}
      style={{
        "background-color":
          props.status === "success"
            ? "#22c55e"
            : props.status === "error"
              ? "#ef4444"
              : props.status === "testing"
                ? "#eab308"
                : "#6b7280",
      }}
    />
  );
}

interface EditForm {
  name: string;
  implementation: string;
  url: string;
  api_key: string;
  enable_rss: boolean;
  enable_search: boolean;
  priority: number;
}

interface ClientEditForm {
  name: string;
  implementation: string;
  host: string;
  port: number;
  username: string;
  password: string;
  url_base: string;
  category: string;
  priority: number;
}

interface ClientSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  url_base: string;
  category: string;
}

function implementationLabel(impl: string): string {
  switch (impl) {
    case "torznab":
      return "Torznab";
    case "newznab":
      return "Newznab";
    case "rss":
      return "RSS";
    default:
      return impl;
  }
}

function implementationHint(impl: string): string {
  switch (impl) {
    case "torznab":
      return "Torrent indexer using the Torznab protocol.";
    case "newznab":
      return "Usenet indexer using the Newznab protocol.";
    case "rss":
      return "RSS feed indexer — API key is not required.";
    default:
      return "";
  }
}

function parseClientSettings(settings: string): ClientSettings {
  try {
    const parsed = JSON.parse(settings) as {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      url_base?: string;
      category?: string;
    };
    return {
      host: parsed.host ?? "",
      port: parsed.port ?? 0,
      username: parsed.username ?? "",
      password: parsed.password ?? "",
      url_base: parsed.url_base ?? "",
      category: parsed.category ?? "",
    };
  } catch {
    return { host: "", port: 0, username: "", password: "", url_base: "", category: "" };
  }
}

function buildClientSettings(s: ClientSettings): string {
  return JSON.stringify({
    host: s.host.trim(),
    port: s.port || 0,
    ...(s.username.trim() ? { username: s.username.trim() } : {}),
    ...(s.password ? { password: s.password } : {}),
    ...(s.url_base.trim() ? { url_base: s.url_base.trim() } : {}),
    ...(s.category.trim() ? { category: s.category.trim() } : {}),
  });
}

function IndexersTab() {
  const [showAdd, setShowAdd] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [editForm, setEditForm] = createSignal<EditForm | null>(null);
  useBeforeLeave((event) => {
    if (!editForm()) return;
    event.preventDefault();
    if (window.confirm("Discard unsaved changes?")) event.retry(true);
  });
  const [indexerTestResults, setIndexerTestResults] = createStore<Record<number, TestResult>>({});
  const [autoTested, setAutoTested] = createSignal(false);
  const [isTestingAll, setIsTestingAll] = createOptimistic(false);
  const [adding, setAdding] = createOptimistic(false);
  const [savingId, setSavingId] = createOptimistic<number | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [newName, setNewName] = createSignal("");
  const [newImpl, setNewImpl] = createSignal("torznab");
  const [newUrl, setNewUrl] = createSignal("");
  const [newApiKey, setNewApiKey] = createSignal("");
  const [newEnableRss, setNewEnableRss] = createSignal(true);
  const [newEnableSearch, setNewEnableSearch] = createSignal(true);

  const erroredIndexers: Record<number, Indexer> = {};

  const [indexers, setIndexers] = createOptimisticStore<{
    indexers: (Indexer & { error?: boolean })[];
  }>(
    async () => {
      const data = await api.get<{ indexers: Indexer[] }>("/settings/indexers");
      return {
        indexers: data.indexers.map((i) => (erroredIndexers[i.id] ? { ...i, error: true } : i)),
      };
    },
    { indexers: [] },
  );

  const removeIndexer = action(function* (indexer: Indexer) {
    setIndexers((s) => {
      s.indexers = s.indexers.filter((i) => i.id !== indexer.id);
    });
    try {
      yield api.delete(`/settings/indexers/${indexer.id}`);
      delete erroredIndexers[indexer.id];
    } catch {
      erroredIndexers[indexer.id] = indexer;
    }
    refresh(indexers);
  });

  const [retryingId, setRetryingId] = createOptimistic<number | null>(null);

  const retryRemoveIndexer = action(function* (indexer: Indexer) {
    setRetryingId(indexer.id);
    try {
      yield api.delete(`/settings/indexers/${indexer.id}`);
      delete erroredIndexers[indexer.id];
    } catch {
      /* leave errored */
    }
    refresh(indexers);
  });

  const addIndexer = action(async function* () {
    setAdding(true);
    setActionError(null);
    const settings = JSON.stringify({
      url: newUrl().trim(),
      ...(newApiKey().trim() ? { api_key: newApiKey().trim() } : {}),
    });
    try {
      await api.post("/settings/indexers", {
        name: newName(),
        implementation: newImpl(),
        settings,
        enable_rss: newEnableRss(),
        enable_search: newEnableSearch(),
      });
      yield;
      refresh(indexers);
      setShowAdd(false);
      setNewName("");
      setNewUrl("");
      setNewApiKey("");
      setNewEnableRss(true);
      setNewEnableSearch(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  const updateIndexer = action(async function* (id: number, form: EditForm) {
    setSavingId(id);
    try {
      const settings = JSON.stringify({
        url: form.url.trim(),
        ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
      });
      await api.put(`/settings/indexers/${id}`, { ...form, settings });
      yield;
      refresh(indexers);
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  const testIndexer = action(async function* (id: number) {
    setIndexerTestResults((r) => {
      r[id] = { status: "testing" };
    });
    try {
      const data = yield api.post<{ success: boolean; message?: string }>(
        `/settings/indexers/${id}/test`,
      );
      setIndexerTestResults((r) => {
        r[id] = { status: data.success ? "success" : "error", message: data.message };
      });
    } catch (err) {
      setIndexerTestResults((r) => {
        r[id] = { status: "error", message: err instanceof Error ? err.message : "Test failed" };
      });
    }
  });

  createEffect(
    () => indexers.indexers,
    (list) => {
      if (!autoTested() && list.length > 0) {
        setAutoTested(true);
        const timers = list.map((idx, i) => setTimeout(() => void testIndexer(idx.id), i * 300));
        return () => timers.forEach(clearTimeout);
      }
    },
  );

  const testAllIndexers = action(async function* () {
    setIsTestingAll(true);
    yield;
    const list = await resolve(() => indexers.indexers);
    if (list.length === 0) return;
    for (const idx of list) {
      try {
        await testIndexer(idx.id);
      } catch {
        /* handled inside */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  return (
    <div>
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
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Indexers</h3>
            <div class="flex gap-2">
              <Show when={indexers.indexers.length > 0}>
                <button
                  onClick={() => void testAllIndexers()}
                  disabled={isTestingAll()}
                  class="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                >
                  <Show when={isTestingAll()} fallback="Test All">
                    Testing All...
                  </Show>
                </button>
              </Show>
              <button
                onClick={() => setShowAdd(!showAdd())}
                class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
              >
                {showAdd() ? "Cancel" : "Add Indexer"}
              </button>
            </div>
          </div>

          <Show when={actionError()}>
            <p class="text-sm text-red-400 mt-2">{actionError()}</p>
          </Show>

          <Show when={showAdd()}>
            <div class="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    value={newName()}
                    onInput={(e) => setNewName(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="My Indexer"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Type</label>
                  <select
                    value={newImpl()}
                    onChange={(e) => setNewImpl(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                  >
                    <option value="torznab">Torznab (torrent)</option>
                    <option value="newznab">Newznab (usenet)</option>
                    <option value="rss">RSS</option>
                  </select>
                  <p class="mt-1 text-xs text-gray-500">{implementationHint(newImpl())}</p>
                </div>
                <div class="sm:col-span-2">
                  <label class="block text-xs text-gray-400 mb-1">URL</label>
                  <input
                    value={newUrl()}
                    onInput={(e) => setNewUrl(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="https://indexer.example.com"
                  />
                </div>
                <div class="sm:col-span-2">
                  <label class="block text-xs text-gray-400 mb-1">API Key</label>
                  <input
                    type="password"
                    value={newApiKey()}
                    onInput={(e) => setNewApiKey(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div class="flex items-end gap-6">
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newEnableRss()}
                      onChange={(e) => setNewEnableRss(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    Enable RSS
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newEnableSearch()}
                      onChange={(e) => setNewEnableSearch(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    Enable Search
                  </label>
                </div>
              </div>
              <div class="flex gap-3 items-center mt-4">
                <button
                  onClick={() => void addIndexer()}
                  disabled={adding() || !newName() || !newUrl().trim()}
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
                <p class="text-xs text-gray-500">A URL is required to connect.</p>
              </div>
            </div>
          </Show>

          <Show
            when={indexers.indexers.length > 0}
            fallback={<p class="text-gray-500 text-sm">No indexers configured.</p>}
          >
            <div class="space-y-2">
              <For each={indexers.indexers}>
                {(idx) => (
                  <Show
                    when={editingId() === idx.id}
                    fallback={
                      <div
                        class={[
                          "flex items-center gap-4 p-3 bg-gray-900 rounded-lg border transition-colors",
                          { "border-red-800": !!idx.error, "border-gray-800": !idx.error },
                        ]}
                      >
                        <StatusDot status={indexerTestResults[idx.id]?.status ?? "idle"} />
                        <div class="flex-1 min-w-0">
                          <p class="font-medium truncate">{idx.name}</p>
                          <div class="flex flex-wrap gap-1.5 mt-1">
                            <span class="text-xs bg-indigo-900/40 text-indigo-400 border border-indigo-800 rounded px-1.5 py-0.5">
                              {implementationLabel(idx.implementation)}
                            </span>
                            <Show when={idx.enable_rss}>
                              <span class="text-xs bg-green-900/40 text-green-400 border border-green-800 rounded px-1.5 py-0.5">
                                RSS
                              </span>
                            </Show>
                            <Show when={idx.enable_search}>
                              <span class="text-xs bg-green-900/40 text-green-400 border border-green-800 rounded px-1.5 py-0.5">
                                Search
                              </span>
                            </Show>
                            <Show when={!idx.enable_rss && !idx.enable_search}>
                              <span class="text-xs bg-gray-800 text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">
                                Disabled
                              </span>
                            </Show>
                            <Show when={idx.priority !== 0}>
                              <span class="text-xs bg-gray-800 text-gray-400 border border-gray-700 rounded px-1.5 py-0.5">
                                Priority: {idx.priority}
                              </span>
                            </Show>
                          </div>
                          <Show when={indexerTestResults[idx.id]}>
                            <Switch>
                              <Match when={indexerTestResults[idx.id]?.status === "success"}>
                                <p class="text-xs text-green-400 mt-1">
                                  ✓ {indexerTestResults[idx.id]?.message}
                                </p>
                              </Match>
                              <Match when={indexerTestResults[idx.id]?.status === "error"}>
                                <p class="text-xs text-red-400 mt-1">
                                  ✗ {indexerTestResults[idx.id]?.message}
                                </p>
                              </Match>
                            </Switch>
                          </Show>
                          <Show when={idx.error}>
                            <p class="text-xs text-red-400 mt-1">Failed to remove — click Retry</p>
                          </Show>
                        </div>
                        <button
                          onClick={() => void testIndexer(idx.id)}
                          disabled={indexerTestResults[idx.id]?.status === "testing"}
                          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
                        >
                          <Show
                            when={indexerTestResults[idx.id]?.status === "testing"}
                            fallback="Test"
                          >
                            Testing...
                          </Show>
                        </button>
                        <button
                          onClick={() => {
                            let url = "";
                            let api_key = "";
                            try {
                              const parsed = JSON.parse(idx.settings) as {
                                url?: string;
                                api_key?: string;
                              };
                              url = parsed.url ?? "";
                              api_key = parsed.api_key ?? "";
                            } catch {
                              // use defaults
                            }
                            setEditingId(idx.id);
                            setEditForm({
                              name: idx.name,
                              implementation: idx.implementation,
                              url,
                              api_key,
                              enable_rss: idx.enable_rss,
                              enable_search: idx.enable_search,
                              priority: idx.priority,
                            });
                          }}
                          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
                        >
                          Edit
                        </button>
                        <Show
                          when={idx.error}
                          fallback={
                            <button
                              onClick={() => void removeIndexer(idx)}
                              class="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
                            >
                              Remove
                            </button>
                          }
                        >
                          <button
                            onClick={() => void retryRemoveIndexer(idx)}
                            disabled={retryingId() === idx.id}
                            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
                          >
                            {retryingId() === idx.id ? "Retrying..." : "Retry"}
                          </button>
                        </Show>
                      </div>
                    }
                  >
                    <div class="p-3 bg-gray-900 rounded-lg border border-gray-800">
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label class="block text-xs text-gray-400 mb-1">Name</label>
                          <input
                            value={editForm()?.name ?? ""}
                            onInput={(e) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, name: e.currentTarget.value } : null,
                              )
                            }
                            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                          />
                        </div>
                        <div>
                          <label class="block text-xs text-gray-400 mb-1">Type</label>
                          <select
                            value={editForm()?.implementation ?? "torznab"}
                            onChange={(e) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, implementation: e.currentTarget.value } : null,
                              )
                            }
                            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                          >
                            <option value="torznab">Torznab (torrent)</option>
                            <option value="newznab">Newznab (usenet)</option>
                            <option value="rss">RSS</option>
                          </select>
                          <p class="mt-1 text-xs text-gray-500">
                            {implementationHint(editForm()?.implementation ?? "torznab")}
                          </p>
                        </div>
                        <div class="sm:col-span-2">
                          <label class="block text-xs text-gray-400 mb-1">URL</label>
                          <input
                            value={editForm()?.url ?? ""}
                            onInput={(e) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, url: e.currentTarget.value } : null,
                              )
                            }
                            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                            placeholder="https://indexer.example.com"
                          />
                        </div>
                        <div class="sm:col-span-2">
                          <label class="block text-xs text-gray-400 mb-1">API Key</label>
                          <input
                            type="password"
                            value={editForm()?.api_key ?? ""}
                            onInput={(e) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, api_key: e.currentTarget.value } : null,
                              )
                            }
                            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label class="block text-xs text-gray-400 mb-1">Priority</label>
                          <input
                            type="number"
                            value={editForm()?.priority ?? 0}
                            onInput={(e) =>
                              setEditForm((prev) =>
                                prev ? { ...prev, priority: Number(e.currentTarget.value) } : null,
                              )
                            }
                            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                          />
                        </div>
                        <div class="flex items-end gap-6">
                          <label class="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={editForm()?.enable_rss ?? false}
                              onChange={(e) =>
                                setEditForm((prev) =>
                                  prev ? { ...prev, enable_rss: e.currentTarget.checked } : null,
                                )
                              }
                              class="rounded bg-gray-800 border-gray-700"
                            />
                            Enable RSS
                          </label>
                          <label class="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={editForm()?.enable_search ?? false}
                              onChange={(e) =>
                                setEditForm((prev) =>
                                  prev ? { ...prev, enable_search: e.currentTarget.checked } : null,
                                )
                              }
                              class="rounded bg-gray-800 border-gray-700"
                            />
                            Enable Search
                          </label>
                        </div>
                      </div>
                      <div class="flex gap-2 mt-3 justify-end">
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditForm(null);
                          }}
                          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (editForm()) {
                              void updateIndexer(idx.id, editForm()!);
                            }
                          }}
                          disabled={savingId() === idx.id || !editForm()?.name}
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

function DownloadClientsTab() {
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
  const [adding, setAdding] = createOptimistic(false);
  const [savingClientId, setSavingClientId] = createOptimistic<number | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [newName, setNewName] = createSignal("");
  const [newImpl, setNewImpl] = createSignal("transmission");
  const [newHost, setNewHost] = createSignal("");
  const [newPort, setNewPort] = createSignal<number>(0);
  const [newUsername, setNewUsername] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [newUrlBase, setNewUrlBase] = createSignal("");
  const [newCategory, setNewCategory] = createSignal("");

  const erroredClients: Record<number, DownloadClient> = {};

  const [clients, setClients] = createOptimisticStore<{
    download_clients: (DownloadClient & { error?: boolean })[];
  }>(
    async () => {
      const data = await api.get<{ download_clients: DownloadClient[] }>(
        "/settings/downloadclients",
      );
      return {
        download_clients: data.download_clients.map((c) =>
          erroredClients[c.id] ? { ...c, error: true } : c,
        ),
      };
    },
    { download_clients: [] },
  );

  const removeClient = action(function* (client: DownloadClient) {
    setClients((s) => {
      s.download_clients = s.download_clients.filter((c) => c.id !== client.id);
    });
    try {
      yield api.delete(`/settings/downloadclients/${client.id}`);
      delete erroredClients[client.id];
    } catch {
      erroredClients[client.id] = client;
    }
    refresh(clients);
  });

  const [retryingClientId, setRetryingClientId] = createOptimistic<number | null>(null);

  const retryRemoveClient = action(function* (client: DownloadClient) {
    setRetryingClientId(client.id);
    try {
      yield api.delete(`/settings/downloadclients/${client.id}`);
      delete erroredClients[client.id];
    } catch {
      /* leave errored */
    }
    refresh(clients);
  });

  const addClient = action(async function* () {
    setAdding(true);
    setActionError(null);
    const settings = buildClientSettings({
      host: newHost(),
      port: newPort(),
      username: newUsername(),
      password: newPassword(),
      url_base: newUrlBase(),
      category: newCategory(),
    });
    try {
      await api.post("/settings/downloadclients", {
        name: newName(),
        implementation: newImpl(),
        settings,
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  const updateClient = action(async function* (id: number, form: ClientEditForm) {
    setSavingClientId(id);
    try {
      await api.put(`/settings/downloadclients/${id}`, {
        name: form.name,
        implementation: form.implementation,
        settings: buildClientSettings(form),
        priority: form.priority,
      });
      yield;
      refresh(clients);
      setEditingClientId(null);
      setClientEditForm(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  const testClient = action(async function* (id: number) {
    setClientTestResults((r) => {
      r[id] = { status: "testing" };
    });
    try {
      const data = yield api.post<{
        success: boolean;
        message?: string;
        version?: string;
        default_save_path?: string;
      }>(`/settings/downloadclients/${id}/test`);
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
  });

  createEffect(
    () => clients.download_clients,
    (list) => {
      if (!autoTested() && list.length > 0) {
        setAutoTested(true);
        const timers = list.map((cl, i) => setTimeout(() => void testClient(cl.id), i * 300));
        return () => timers.forEach(clearTimeout);
      }
    },
  );

  const testAllClients = action(async function* () {
    setIsTestingAll(true);
    yield;
    const list = await resolve(() => clients.download_clients);
    if (list.length === 0) return;
    for (const cl of list) {
      try {
        await testClient(cl.id);
      } catch {
        /* handled inside */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  return (
    <div>
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
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Download Clients</h3>
            <div class="flex gap-2">
              <Show when={clients.download_clients.length > 0}>
                <button
                  onClick={() => void testAllClients()}
                  disabled={isTestingAll()}
                  class="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                >
                  <Show when={isTestingAll()} fallback="Test All">
                    Testing All...
                  </Show>
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
                  </select>
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Host</label>
                  <input
                    value={newHost()}
                    onInput={(e) => setNewHost(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="localhost"
                  />
                </div>
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
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Username</label>
                  <input
                    value={newUsername()}
                    onInput={(e) => setNewUsername(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="Optional"
                  />
                </div>
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
                <div>
                  <label class="block text-xs text-gray-400 mb-1">URL Base</label>
                  <input
                    value={newUrlBase()}
                    onInput={(e) => setNewUrlBase(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="/transmission/"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Category</label>
                  <input
                    value={newCategory()}
                    onInput={(e) => setNewCategory(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="books"
                  />
                </div>
              </div>
              <div class="flex gap-3 items-center mt-4">
                <button
                  onClick={() => void addClient()}
                  disabled={adding() || !newName() || !newHost().trim()}
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
                <p class="text-xs text-gray-500">A host is required to connect.</p>
              </div>
            </div>
          </Show>

          <Show
            when={clients.download_clients.length > 0}
            fallback={<p class="text-gray-500 text-sm">No download clients configured.</p>}
          >
            <div class="space-y-2">
              <For each={clients.download_clients}>
                {(client) => (
                  <Show
                    when={editingClientId() === client.id}
                    fallback={
                      <div
                        class={[
                          "flex items-center gap-4 p-3 bg-gray-900 rounded-lg border transition-colors",
                          { "border-red-800": !!client.error, "border-gray-800": !client.error },
                        ]}
                      >
                        <StatusDot status={clientTestResults[client.id]?.status ?? "idle"} />
                        <div class="flex-1 min-w-0">
                          <p class="font-medium truncate">{client.name}</p>
                          <p class="text-xs text-gray-400">
                            {implementationLabel(client.implementation)}
                            <Show when={parseClientSettings(client.settings).host}>
                              {" · "}
                              {parseClientSettings(client.settings).host}
                              <Show when={parseClientSettings(client.settings).port}>
                                :{parseClientSettings(client.settings).port}
                              </Show>
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
                        <button
                          onClick={() => {
                            const parsed = parseClientSettings(client.settings);
                            setEditingClientId(client.id);
                            setClientEditForm({
                              name: client.name,
                              implementation: client.implementation,
                              ...parsed,
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
                          <Show
                            when={clientTestResults[client.id]?.status === "testing"}
                            fallback="Test"
                          >
                            Testing...
                          </Show>
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
                          </select>
                        </div>
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

function NotificationsTab() {
  const [showAdd, setShowAdd] = createSignal(false);
  const [adding, setAdding] = createOptimistic(false);
  const [testingId, setTestingId] = createOptimistic<number | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [newName, setNewName] = createSignal("");
  const [newImpl, setNewImpl] = createSignal("apprise");
  const [newWebhookUrl, setNewWebhookUrl] = createSignal("");
  const [newOnGrab, setNewOnGrab] = createSignal(true);
  const [newOnImport, setNewOnImport] = createSignal(true);
  const [newOnUpgrade, setNewOnUpgrade] = createSignal(true);
  const [newOnHealthIssue, setNewOnHealthIssue] = createSignal(true);

  const erroredNotifications: Record<number, Notification> = {};

  const [notifications, setNotifications] = createOptimisticStore<{
    notifications: (Notification & { error?: boolean })[];
  }>(
    async () => {
      const data = await api.get<{ notifications: Notification[] }>("/notifications");
      return {
        notifications: data.notifications.map((n) =>
          erroredNotifications[n.id] ? { ...n, error: true } : n,
        ),
      };
    },
    { notifications: [] },
  );

  const removeNotification = action(function* (notif: Notification) {
    setNotifications((s) => {
      s.notifications = s.notifications.filter((n) => n.id !== notif.id);
    });
    try {
      yield api.delete(`/notifications/${notif.id}`);
      delete erroredNotifications[notif.id];
    } catch {
      erroredNotifications[notif.id] = notif;
    }
    refresh(notifications);
  });

  const [retryingNotificationId, setRetryingNotificationId] = createOptimistic<number | null>(null);

  const retryRemoveNotification = action(function* (notif: Notification) {
    setRetryingNotificationId(notif.id);
    try {
      yield api.delete(`/notifications/${notif.id}`);
      delete erroredNotifications[notif.id];
    } catch {
      /* leave errored */
    }
    refresh(notifications);
  });

  const addNotification = action(async function* () {
    setAdding(true);
    try {
      await api.post("/notifications", {
        name: newName(),
        implementation: newImpl(),
        settings: JSON.stringify({ webhook_url: newWebhookUrl() }),
        on_grab: newOnGrab(),
        on_import: newOnImport(),
        on_upgrade: newOnUpgrade(),
        on_health_issue: newOnHealthIssue(),
      });
      yield;
      refresh(notifications);
      setShowAdd(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  const testNotification = action(async function* (id: number) {
    setTestingId(id);
    try {
      await api.post(`/notifications/${id}/test`);
      yield;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    }
  });

  return (
    <div>
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
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">Notifications</h3>
            <button
              onClick={() => setShowAdd(!showAdd())}
              class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
            >
              {showAdd() ? "Cancel" : "Add Notification"}
            </button>
          </div>

          <Show when={actionError()}>
            <p class="text-sm text-red-400 mt-2">{actionError()}</p>
          </Show>

          <Show when={showAdd()}>
            <div class="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <div class="flex flex-col gap-3">
                <div class="flex gap-3 items-end">
                  <div class="flex-1">
                    <label class="block text-xs text-gray-400 mb-1">Name</label>
                    <input
                      value={newName()}
                      onInput={(e) => setNewName(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="My Notification"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Implementation</label>
                    <select
                      value={newImpl()}
                      onChange={(e) => setNewImpl(e.currentTarget.value)}
                      class="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    >
                      <option value="apprise">Apprise</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Webhook URL</label>
                  <input
                    value={newWebhookUrl()}
                    onInput={(e) => setNewWebhookUrl(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="https://hooks.example.com/..."
                  />
                </div>
                <div class="flex gap-6 items-center">
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newOnGrab()}
                      onChange={(e) => setNewOnGrab(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    On Grab
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newOnImport()}
                      onChange={(e) => setNewOnImport(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    On Import
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newOnUpgrade()}
                      onChange={(e) => setNewOnUpgrade(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    On Upgrade
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newOnHealthIssue()}
                      onChange={(e) => setNewOnHealthIssue(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    On Health Issue
                  </label>
                  <button
                    onClick={() => void addNotification()}
                    disabled={adding() || !newName()}
                    class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </Show>

          <Show
            when={notifications.notifications.length > 0}
            fallback={<p class="text-gray-500 text-sm">No notifications configured.</p>}
          >
            <div class="space-y-2">
              <For each={notifications.notifications}>
                {(notif) => (
                  <NotificationItem
                    notif={notif}
                    testNotification={(id) => void testNotification(id)}
                    deleteNotification={(notif) => void removeNotification(notif)}
                    retryNotification={(notif) => void retryRemoveNotification(notif)}
                    testing={testingId() === notif.id}
                    retrying={retryingNotificationId() === notif.id}
                  />
                )}
              </For>
            </div>
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}

function NotificationItem(props: {
  notif: Notification & { error?: boolean };
  testNotification: (id: number) => void;
  deleteNotification: (notif: Notification) => void;
  retryNotification: (notif: Notification) => void;
  testing: boolean;
  retrying: boolean;
}) {
  const parsedSettings = createMemo(() => {
    try {
      return JSON.parse(props.notif.settings) as { webhook_url?: string };
    } catch {
      return {} as { webhook_url?: string };
    }
  });

  return (
    <div
      class={[
        "flex items-center gap-4 p-3 bg-gray-900 rounded-lg border transition-colors",
        { "border-red-800": !!props.notif.error, "border-gray-800": !props.notif.error },
      ]}
    >
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">{props.notif.name}</p>
        <p class="text-xs text-gray-400">
          {props.notif.implementation}
          <Show when={parsedSettings().webhook_url}>
            {" \u00b7 "}
            {parsedSettings().webhook_url}
          </Show>
        </p>
        <div class="flex gap-3 mt-1 text-xs">
          <span
            class={[
              "text-xs",
              { "text-green-400": props.notif.on_grab, "text-gray-600": !props.notif.on_grab },
            ]}
          >
            {props.notif.on_grab ? "\u2713" : "\u2717"} Grab
          </span>
          <span
            class={[
              "text-xs",
              { "text-green-400": props.notif.on_import, "text-gray-600": !props.notif.on_import },
            ]}
          >
            {props.notif.on_import ? "\u2713" : "\u2717"} Import
          </span>
          <span
            class={[
              "text-xs",
              {
                "text-green-400": props.notif.on_upgrade,
                "text-gray-600": !props.notif.on_upgrade,
              },
            ]}
          >
            {props.notif.on_upgrade ? "\u2713" : "\u2717"} Upgrade
          </span>
          <span
            class={[
              "text-xs",
              {
                "text-green-400": props.notif.on_health_issue,
                "text-gray-600": !props.notif.on_health_issue,
              },
            ]}
          >
            {props.notif.on_health_issue ? "\u2713" : "\u2717"} Health
          </span>
        </div>
        <Show when={props.notif.error}>
          <p class="text-xs text-red-400 mt-1">Failed to remove — click Retry</p>
        </Show>
      </div>
      <button
        onClick={() => props.testNotification(props.notif.id)}
        disabled={props.testing}
        class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
      >
        Test
      </button>
      <Show
        when={props.notif.error}
        fallback={
          <button
            onClick={() => props.deleteNotification(props.notif)}
            class="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
          >
            Remove
          </button>
        }
      >
        <button
          onClick={() => props.retryNotification(props.notif)}
          disabled={props.retrying}
          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
        >
          {props.retrying ? "Retrying..." : "Retry"}
        </button>
      </Show>
    </div>
  );
}

function AccountTab() {
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal(false);

  const passwordError = createMemo(() => {
    const np = newPassword();
    if (np && np.length < 8) return "New password must be at least 8 characters";
    if (confirmPassword() && np !== confirmPassword()) return "Passwords do not match";
    return null;
  });

  const submit = action(async function* () {
    setError(null);
    setSuccess(false);
    if (passwordError()) {
      setError(passwordError());
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword(), newPassword());
      yield;
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  });

  return (
    <div>
      <h3 class="text-lg font-semibold mb-4">Account</h3>
      <Show
        when={authEnabled()}
        fallback={<p class="text-sm text-gray-500">Authentication is disabled.</p>}
      >
        <div class="max-w-md p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Username</label>
            <p class="text-sm">{user()?.username ?? "unknown"}</p>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword()}
              onInput={(e) => setCurrentPassword(e.currentTarget.value)}
              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
              autocomplete="current-password"
            />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword()}
              onInput={(e) => setNewPassword(e.currentTarget.value)}
              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
              autocomplete="new-password"
            />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword()}
              onInput={(e) => setConfirmPassword(e.currentTarget.value)}
              class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
              autocomplete="new-password"
            />
          </div>
          <Show when={error()}>
            <p class="text-sm text-red-400">{error()}</p>
          </Show>
          <Show when={success()}>
            <p class="text-sm text-green-400">Password updated.</p>
          </Show>
          <button
            onClick={() => void submit()}
            disabled={submitting() || !currentPassword() || !newPassword() || !!passwordError()}
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded text-sm transition-colors"
          >
            {submitting() ? "Updating..." : "Update Password"}
          </button>
        </div>
      </Show>
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = createSignal<
    "indexers" | "clients" | "notifications" | "account"
  >("indexers");

  return (
    <div>
      <Title>Settings · ReadingRoom</Title>
      <h2 class="text-2xl font-bold mb-6">Settings</h2>

      <div class="flex gap-4 mb-6 border-b border-gray-800 pb-4">
        <button
          onClick={() => setActiveTab("indexers")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "indexers",
              "text-gray-400 hover:text-gray-200": activeTab() !== "indexers",
            },
          ]}
        >
          Indexers
        </button>
        <button
          onClick={() => setActiveTab("clients")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "clients",
              "text-gray-400 hover:text-gray-200": activeTab() !== "clients",
            },
          ]}
        >
          Download Clients
        </button>
        <button
          onClick={() => setActiveTab("notifications")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "notifications",
              "text-gray-400 hover:text-gray-200": activeTab() !== "notifications",
            },
          ]}
        >
          Notifications
        </button>
        <button
          onClick={() => setActiveTab("account")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "account",
              "text-gray-400 hover:text-gray-200": activeTab() !== "account",
            },
          ]}
        >
          Account
        </button>
      </div>

      <Switch>
        <Match when={activeTab() === "indexers"}>
          <IndexersTab />
        </Match>
        <Match when={activeTab() === "clients"}>
          <DownloadClientsTab />
        </Match>
        <Match when={activeTab() === "notifications"}>
          <NotificationsTab />
        </Match>
        <Match when={activeTab() === "account"}>
          <AccountTab />
        </Match>
      </Switch>
    </div>
  );
}
