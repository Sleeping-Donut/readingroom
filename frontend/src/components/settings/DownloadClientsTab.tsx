import { useBeforeLeave } from "@solidjs/router";
import {
  action,
  createEffect,
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

import type { DownloadClient, TestResult } from "../../types";

import * as settingsApi from "../../api/settings";
import { implementationLabel } from "./shared";
import StatusDot from "./StatusDot";

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

export default function DownloadClientsTab() {
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
  const [isTestingAll, setIsTestingAll] = createSignal(false);
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
    } finally {
      setAdding(false);
    }
  });

  const updateClient = action(async function* (id: number, form: ClientEditForm) {
    setSavingClientId(id);
    try {
      await settingsApi.updateDownloadClient(id, form);
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

  const testClient = async (id: number) => {
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

  const testAllClients = async () => {
    setIsTestingAll(true);
    try {
      const list = clients.download_clients;
      if (list.length === 0) return;
      for (const cl of list) {
        try {
          await testClient(cl.id);
        } catch {
          /* handled inside */
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      setIsTestingAll(false);
    }
  };

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
