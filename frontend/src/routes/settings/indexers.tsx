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

import type { Indexer, TestResult } from "../../types";

import * as settingsApi from "../../api/settings";
import { implementationLabel, implementationHint } from "../../components/settings/shared";
import StatusDot from "../../components/settings/StatusDot";

export const route = defineFileRoute("/settings/indexers", {
  info: { label: "Indexers" },
});

interface EditForm {
  name: string;
  implementation: string;
  url: string;
  api_key: string;
  enable_rss: boolean;
  enable_search: boolean;
  priority: number;
}

const NEW_INDEXER_SCHEMA = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "Name is required")),
  implementation: v.union([v.literal("torznab"), v.literal("newznab"), v.literal("rss")]),
  url: v.pipe(v.string(), v.trim(), v.minLength(1, "URL is required")),
  api_key: v.optional(v.string()),
  enable_rss: v.boolean(),
  enable_search: v.boolean(),
});

const INDEXER_SETTINGS_SCHEMA = v.object({
  url: v.optional(v.string()),
  api_key: v.optional(v.string()),
});

export default function IndexersTab(_props: RouteProps<typeof route>) {
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
  // Optimistic: reverts to false automatically when the action settles.
  const [isTestingAll, setIsTestingAll] = createOptimistic(false);
  const [adding, setAdding] = createSignal(false);
  const [savingId, setSavingId] = createSignal<number | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [newIndexer, setNewIndexer] = createStore({
    name: "",
    implementation: "torznab",
    url: "",
    api_key: "",
    enable_rss: true,
    enable_search: true,
  });
  const resetNewIndexer = () =>
    setNewIndexer((s) => {
      s.name = "";
      s.implementation = "torznab";
      s.url = "";
      s.api_key = "";
      s.enable_rss = true;
      s.enable_search = true;
    });

  const erroredIndexers: Record<number, Indexer> = {};

  const [indexers, setIndexers] = createOptimisticStore<{
    indexers: (Indexer & { error?: boolean })[];
  }>(
    async () => {
      const data = await settingsApi.listIndexers();
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
      yield settingsApi.removeIndexer(indexer.id);
      delete erroredIndexers[indexer.id];
    } catch {
      erroredIndexers[indexer.id] = indexer;
    }
    refresh(indexers);
  });

  const [retryingId, setRetryingId] = createSignal<number | null>(null);

  const retryRemoveIndexer = action(function* (indexer: Indexer) {
    setRetryingId(indexer.id);
    try {
      yield settingsApi.removeIndexer(indexer.id);
      delete erroredIndexers[indexer.id];
    } catch {
      /* leave errored */
    } finally {
      setRetryingId(null);
    }
    refresh(indexers);
  });

  const addIndexer = action(async function* () {
    const parsed = v.safeParse(NEW_INDEXER_SCHEMA, {
      name: newIndexer.name,
      implementation: newIndexer.implementation,
      url: newIndexer.url,
      api_key: newIndexer.api_key,
      enable_rss: newIndexer.enable_rss,
      enable_search: newIndexer.enable_search,
    });
    if (!parsed.success) {
      setActionError(parsed.issues?.[0]?.message ?? "Invalid indexer settings");
      return;
    }
    setAdding(true);
    setActionError(null);
    try {
      await settingsApi.addIndexer({
        name: parsed.output.name,
        implementation: parsed.output.implementation,
        url: parsed.output.url,
        api_key: parsed.output.api_key ?? "",
        enable_rss: parsed.output.enable_rss,
        enable_search: parsed.output.enable_search,
      });
      yield;
      refresh(indexers);
      setShowAdd(false);
      resetNewIndexer();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAdding(false);
    }
  });

  const updateIndexer = action(async function* (id: number, form: EditForm) {
    setSavingId(id);
    try {
      await settingsApi.updateIndexer(id, form);
      yield;
      refresh(indexers);
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSavingId(null);
    }
  });

  const testIndexer = action(async function* (id: number) {
    setIndexerTestResults((r) => {
      r[id] = { status: "testing" };
    });
    try {
      const data = await settingsApi.testIndexer(id);
      yield;
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

  const testAllIndexers = action(function* () {
    setIsTestingAll(true);
    const list = indexers.indexers;
    if (list.length === 0) return;
    for (const idx of list) {
      try {
        yield testIndexer(idx.id);
      } catch {
        /* handled inside */
      }
      yield new Promise((r) => setTimeout(r, 200));
    }
  });

  return (
    <div>
      <Title>Indexers · Settings · ReadingRoom</Title>
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
            <h3 class="text-lg font-semibold">Indexers</h3>
            <div class="flex gap-2">
              <Show when={indexers.indexers.length > 0}>
                <button
                  onClick={() => void testAllIndexers()}
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
                    value={newIndexer.name}
                    onInput={(e) =>
                      setNewIndexer((s) => {
                        s.name = e.currentTarget.value;
                      })
                    }
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="My Indexer"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Type</label>
                  <select
                    value={newIndexer.implementation}
                    onChange={(e) =>
                      setNewIndexer((s) => {
                        s.implementation = e.currentTarget.value;
                      })
                    }
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                  >
                    <option value="torznab">Torznab (torrent)</option>
                    <option value="newznab">Newznab (usenet)</option>
                    <option value="rss">RSS</option>
                  </select>
                  <p class="mt-1 text-xs text-gray-500">
                    {implementationHint(newIndexer.implementation)}
                  </p>
                </div>
                <div class="sm:col-span-2">
                  <label class="block text-xs text-gray-400 mb-1">URL</label>
                  <input
                    value={newIndexer.url}
                    onInput={(e) =>
                      setNewIndexer((s) => {
                        s.url = e.currentTarget.value;
                      })
                    }
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="https://indexer.example.com"
                  />
                </div>
                <div class="sm:col-span-2">
                  <label class="block text-xs text-gray-400 mb-1">API Key</label>
                  <input
                    type="password"
                    value={newIndexer.api_key}
                    onInput={(e) =>
                      setNewIndexer((s) => {
                        s.api_key = e.currentTarget.value;
                      })
                    }
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div class="flex items-end gap-6">
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newIndexer.enable_rss}
                      onChange={(e) =>
                        setNewIndexer((s) => {
                          s.enable_rss = e.currentTarget.checked;
                        })
                      }
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    Enable RSS
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newIndexer.enable_search}
                      onChange={(e) =>
                        setNewIndexer((s) => {
                          s.enable_search = e.currentTarget.checked;
                        })
                      }
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    Enable Search
                  </label>
                </div>
              </div>
              <div class="flex gap-3 items-center mt-4">
                <button
                  onClick={() => void addIndexer()}
                  disabled={adding() || !newIndexer.name || !newIndexer.url.trim()}
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
                          "flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-900 rounded-lg border transition-colors",
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
                        <div class="flex flex-wrap gap-2 shrink-0">
                          <button
                            onClick={() => void testIndexer(idx.id)}
                            disabled={indexerTestResults[idx.id]?.status === "testing"}
                            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
                          >
                            {indexerTestResults[idx.id]?.status === "testing"
                              ? "Testing..."
                              : "Test"}
                          </button>
                          <button
                            onClick={() => {
                              let url = "";
                              let api_key = "";
                              const parsed = v.safeParse(
                                INDEXER_SETTINGS_SCHEMA,
                                (() => {
                                  try {
                                    return JSON.parse(idx.settings);
                                  } catch {
                                    return {};
                                  }
                                })(),
                              );
                              if (parsed.success) {
                                url = parsed.output.url ?? "";
                                api_key = parsed.output.api_key ?? "";
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
