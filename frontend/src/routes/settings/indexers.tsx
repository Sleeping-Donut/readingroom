import { Title } from "@solidjs/meta";
import { useBeforeLeave, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
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
  Show,
  Switch,
} from "solid-js";
import * as v from "valibot";

import type { ImplementationInfo } from "../../api/settings";
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

const CORE_IMPLEMENTATIONS: ImplementationInfo[] = [
  {
    id: "torznab",
    label: "Torznab (torrent)",
    hint: implementationHint("torznab"),
    supports_search: true,
    supports_rss: true,
    plugin: false,
    params: [],
  },
  {
    id: "newznab",
    label: "Newznab (usenet)",
    hint: implementationHint("newznab"),
    supports_search: true,
    supports_rss: true,
    plugin: false,
    params: [],
  },
  {
    id: "rss",
    label: "RSS",
    hint: implementationHint("rss"),
    supports_search: false,
    supports_rss: true,
    plugin: false,
    params: [],
  },
];

function pluginDefaults(
  params: ImplementationInfo["params"],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const p of params) {
    if (p.default !== undefined) {
      out[p.name] = p.default;
    } else if (p.type === "select" && p.options.length > 0) {
      out[p.name] = p.options[0];
    } else if (p.type === "boolean") {
      out[p.name] = false;
    }
  }
  return out;
}

function buildPluginSettings(
  params: ImplementationInfo["params"],
  values: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const p of params) {
    const value = values[p.name];
    if (value === undefined || value === "") continue;
    if (p.type === "number") {
      const n = Number(value);
      out[p.name] = Number.isNaN(n) ? 0 : n;
    } else if (p.type === "boolean") {
      out[p.name] = Boolean(value);
    } else {
      out[p.name] = typeof value === "string" ? value.trim() : value;
    }
  }
  return out;
}

function pluginComplete(
  impl: ImplementationInfo | null,
  values: Record<string, string | number | boolean>,
): boolean {
  if (!impl || !impl.plugin) return true;
  return impl.params
    .filter((p) => p.required)
    .every((p) => {
      const v = values[p.name];
      return v !== undefined && v !== "";
    });
}

interface IndexerFormValues {
  name: string;
  implementation: string;
  url: string;
  api_key: string;
  enable_rss: boolean;
  enable_search: boolean;
  priority: number;
}

interface PluginFormValues {
  name: string;
  settings: Record<string, string | number | boolean>;
  enable_rss: boolean;
  enable_search: boolean;
  priority: number;
}

/// Fields for one indexer config, driven by the chosen implementation. Used by
/// both the add flow (step 2) and the edit form.
function IndexerConfigFields(props: {
  get: () => IndexerFormValues;
  patch: (v: Partial<IndexerFormValues>) => void;
  showPriority?: boolean;
}) {
  const impl = () => props.get().implementation;
  const wantsApiKey = () => impl() !== "rss";
  const wantsRss = () => impl() !== "anna";

  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Name</label>
        <input
          value={props.get().name}
          onInput={(e) => props.patch({ name: e.currentTarget.value })}
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
          placeholder="My Indexer"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Type</label>
        <p class="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300">
          {implementationLabel(impl())}
        </p>
        <p class="mt-1 text-xs text-gray-500">{implementationHint(impl())}</p>
      </div>
      <div class="sm:col-span-2">
        <label class="block text-xs text-gray-400 mb-1">URL</label>
        <input
          value={props.get().url}
          onInput={(e) => props.patch({ url: e.currentTarget.value })}
          class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
          placeholder={
            impl() === "anna" ? "https://annas-archive.org" : "https://indexer.example.com"
          }
        />
      </div>
      <Show when={wantsApiKey()}>
        <div class="sm:col-span-2">
          <label class="block text-xs text-gray-400 mb-1">API Key</label>
          <input
            type="password"
            value={props.get().api_key}
            onInput={(e) => props.patch({ api_key: e.currentTarget.value })}
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
            placeholder="Optional"
          />
        </div>
      </Show>
      <Show when={props.showPriority}>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Priority</label>
          <input
            type="number"
            value={props.get().priority}
            onInput={(e) => props.patch({ priority: Number(e.currentTarget.value) })}
            class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
          />
        </div>
      </Show>
      <Show when={wantsRss()}>
        <div class="flex items-end gap-6">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.get().enable_rss}
              onChange={(e) => props.patch({ enable_rss: e.currentTarget.checked })}
              class="rounded bg-gray-800 border-gray-700"
            />
            Enable RSS
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.get().enable_search}
              onChange={(e) => props.patch({ enable_search: e.currentTarget.checked })}
              class="rounded bg-gray-800 border-gray-700"
            />
            Enable Search
          </label>
        </div>
      </Show>
      <Show when={!wantsRss()}>
        <div class="flex items-end gap-6">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.get().enable_search}
              onChange={(e) => props.patch({ enable_search: e.currentTarget.checked })}
              class="rounded bg-gray-800 border-gray-700"
            />
            Enable Search
          </label>
        </div>
      </Show>
    </div>
  );
}

/// Fields generated from a Lua plugin's declared `params`. Values live in a
/// dynamic settings map (not the fixed-shape `IndexerFormValues`).
function PluginConfigFields(props: {
  impl: () => ImplementationInfo | null;
  get: () => PluginFormValues;
  patch: (v: Partial<PluginFormValues>) => void;
  showPriority?: boolean;
}) {
  const supportsRss = () => props.impl()?.supports_rss ?? true;
  const supportsSearch = () => props.impl()?.supports_search ?? true;
  const patchParam = (name: string, value: string | number | boolean) =>
    props.patch({ settings: { ...props.get().settings, [name]: value } });
  const inputClass = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm";

  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Name</label>
        <input
          value={props.get().name}
          onInput={(e) => props.patch({ name: e.currentTarget.value })}
          class={inputClass}
          placeholder="My Indexer"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Type</label>
        <p class="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300">
          {props.impl()?.label ?? ""}
        </p>
        <p class="mt-1 text-xs text-gray-500">{props.impl()?.hint ?? ""}</p>
      </div>
      <For each={props.impl()?.params ?? []}>
        {(param) => (
          <div class={param.type === "string" || param.type === "password" ? "sm:col-span-2" : ""}>
            <Show
              when={param.type === "boolean"}
              fallback={
                <>
                  <label class="block text-xs text-gray-400 mb-1">
                    {param.label || param.name}
                    {param.required ? " *" : ""}
                  </label>
                  <Switch>
                    <Match when={param.type === "password"}>
                      <input
                        type="password"
                        value={String(props.get().settings[param.name] ?? "")}
                        onInput={(e) => patchParam(param.name, e.currentTarget.value)}
                        class={inputClass}
                        placeholder="Optional"
                      />
                    </Match>
                    <Match when={param.type === "number"}>
                      <input
                        type="number"
                        value={String(props.get().settings[param.name] ?? "")}
                        onInput={(e) => patchParam(param.name, e.currentTarget.value)}
                        class={inputClass}
                      />
                    </Match>
                    <Match when={param.type === "select"}>
                      <select
                        value={String(props.get().settings[param.name] ?? "")}
                        onChange={(e) => patchParam(param.name, e.currentTarget.value)}
                        class={inputClass}
                      >
                        <For each={param.options}>
                          {(opt) => <option value={opt}>{opt}</option>}
                        </For>
                      </select>
                    </Match>
                    <Match when={param.type === "string"}>
                      <input
                        type="text"
                        value={String(props.get().settings[param.name] ?? "")}
                        onInput={(e) => patchParam(param.name, e.currentTarget.value)}
                        class={inputClass}
                      />
                    </Match>
                  </Switch>
                </>
              }
            >
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(props.get().settings[param.name])}
                  onChange={(e) => patchParam(param.name, e.currentTarget.checked)}
                  class="rounded bg-gray-800 border-gray-700"
                />
                {param.label || param.name}
              </label>
            </Show>
          </div>
        )}
      </For>
      <Show when={props.showPriority}>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Priority</label>
          <input
            type="number"
            value={props.get().priority}
            onInput={(e) => props.patch({ priority: Number(e.currentTarget.value) })}
            class={inputClass}
          />
        </div>
      </Show>
      <div class="sm:col-span-2 flex items-end gap-6">
        <Show when={supportsRss()}>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.get().enable_rss}
              onChange={(e) => props.patch({ enable_rss: e.currentTarget.checked })}
              class="rounded bg-gray-800 border-gray-700"
            />
            Enable RSS
          </label>
        </Show>
        <Show when={supportsSearch()}>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.get().enable_search}
              onChange={(e) => props.patch({ enable_search: e.currentTarget.checked })}
              class="rounded bg-gray-800 border-gray-700"
            />
            Enable Search
          </label>
        </Show>
      </div>
    </div>
  );
}

export default function IndexersTab(_props: RouteProps<typeof route>) {
  // Add flow: 0 = closed, 1 = pick implementation, 2 = configure.
  const [addStep, setAddStep] = createSignal<0 | 1 | 2>(0);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [editForm, setEditForm] = createSignal<EditForm | null>(null);
  const [editPluginSettings, setEditPluginSettings] = createSignal<
    Record<string, string | number | boolean>
  >({});
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
    priority: 0,
  });
  const resetNewIndexer = () =>
    setNewIndexer((s) => {
      s.name = "";
      s.implementation = "torznab";
      s.url = "";
      s.api_key = "";
      s.enable_rss = true;
      s.enable_search = true;
      s.priority = 0;
    });

  const [pluginSettings, setPluginSettings] = createSignal<
    Record<string, string | number | boolean>
  >({});

  const implementations = createMemo(
    async () => {
      try {
        return await settingsApi.getIndexerImplementations();
      } catch {
        return null;
      }
    },
    { loadingValue: null },
  );

  const implementationList = createMemo<ImplementationInfo[]>(() => {
    const loaded = implementations()?.implementations;
    return loaded && loaded.length > 0 ? loaded : CORE_IMPLEMENTATIONS;
  });

  const selectedImpl = createMemo<ImplementationInfo | null>(
    () => implementationList().find((i) => i.id === newIndexer.implementation) ?? null,
  );

  const isPlugin = createMemo(() => selectedImpl()?.plugin ?? false);

  const editingImpl = createMemo<ImplementationInfo | null>(
    () => implementationList().find((i) => i.id === editForm()?.implementation) ?? null,
  );

  const labelFor = (id: string) =>
    implementationList().find((i) => i.id === id)?.label ?? implementationLabel(id);

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
    const impl = selectedImpl();
    if (impl?.plugin) {
      setAdding(true);
      setActionError(null);
      try {
        await settingsApi.addIndexer({
          name: newIndexer.name.trim(),
          implementation: newIndexer.implementation,
          url: "",
          api_key: "",
          enable_rss: newIndexer.enable_rss,
          enable_search: newIndexer.enable_search,
          pluginSettings: buildPluginSettings(impl.params, pluginSettings()),
        });
        yield;
        refresh(indexers);
        setAddStep(0);
        resetNewIndexer();
        setPluginSettings({});
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setAdding(false);
      }
      return;
    }
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
      setAddStep(0);
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
      const impl = implementationList().find((i) => i.id === form.implementation) ?? null;
      const pluginSettings = impl?.plugin
        ? buildPluginSettings(impl.params, editPluginSettings())
        : undefined;
      await settingsApi.updateIndexer(id, { ...form, pluginSettings });
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
                onClick={() => setAddStep(addStep() === 0 ? 1 : 0)}
                class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
              >
                {addStep() !== 0 ? "Cancel" : "Add Indexer"}
              </button>
            </div>
          </div>

          <Show when={actionError()}>
            <p class="text-sm text-red-400 mt-2">{actionError()}</p>
          </Show>

          <Show when={addStep() !== 0}>
            <div class="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <Show
                when={addStep() === 1}
                fallback={
                  <>
                    <Show
                      when={isPlugin()}
                      fallback={
                        <IndexerConfigFields
                          get={() => newIndexer}
                          patch={(v) =>
                            setNewIndexer((s) => {
                              Object.assign(s, v);
                            })
                          }
                        />
                      }
                    >
                      <PluginConfigFields
                        impl={() => selectedImpl()}
                        get={() => ({
                          name: newIndexer.name,
                          settings: pluginSettings(),
                          enable_rss: newIndexer.enable_rss,
                          enable_search: newIndexer.enable_search,
                          priority: newIndexer.priority,
                        })}
                        patch={(v) => {
                          if (v.name !== undefined)
                            setNewIndexer((s) => {
                              s.name = v.name as string;
                            });
                          if (v.enable_rss !== undefined)
                            setNewIndexer((s) => {
                              s.enable_rss = v.enable_rss as boolean;
                            });
                          if (v.enable_search !== undefined)
                            setNewIndexer((s) => {
                              s.enable_search = v.enable_search as boolean;
                            });
                          if (v.priority !== undefined)
                            setNewIndexer((s) => {
                              s.priority = v.priority as number;
                            });
                          if (v.settings) setPluginSettings(v.settings);
                        }}
                      />
                    </Show>
                    <div class="flex gap-3 items-center mt-4">
                      <button
                        onClick={() => setAddStep(1)}
                        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => void addIndexer()}
                        disabled={
                          adding() ||
                          !newIndexer.name ||
                          (isPlugin()
                            ? !pluginComplete(selectedImpl(), pluginSettings())
                            : !newIndexer.url.trim())
                        }
                        class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setAddStep(0)}
                        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                      >
                        Cancel
                      </button>
                      <p class="text-xs text-gray-500">
                        {isPlugin()
                          ? "Fill in the required settings."
                          : "A URL is required to connect."}
                      </p>
                    </div>
                  </>
                }
              >
                <h4 class="text-sm font-semibold text-gray-300 mb-3">Indexer type</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <For each={implementationList()}>
                    {(impl) => (
                      <button
                        onClick={() => {
                          setNewIndexer((s) => {
                            s.implementation = impl.id;
                          });
                          if (impl.plugin) {
                            setPluginSettings(pluginDefaults(impl.params));
                          }
                          setAddStep(2);
                        }}
                        class="p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-indigo-600 rounded-lg text-left transition-colors"
                      >
                        <p class="font-medium">{impl.label}</p>
                        <p class="text-xs text-gray-500 mt-1">{impl.hint}</p>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
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
                              {labelFor(idx.implementation)}
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
                              const impl =
                                implementationList().find((i) => i.id === idx.implementation) ??
                                null;
                              let raw: unknown = null;
                              try {
                                raw = JSON.parse(idx.settings);
                              } catch {
                                raw = null;
                              }
                              let url = "";
                              let api_key = "";
                              const parsed = v.safeParse(INDEXER_SETTINGS_SCHEMA, raw);
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
                              if (impl?.plugin) {
                                const settings: Record<string, string | number | boolean> = {};
                                if (raw && typeof raw === "object") {
                                  for (const p of impl.params) {
                                    const val = (raw as Record<string, unknown>)[p.name];
                                    if (
                                      typeof val === "string" ||
                                      typeof val === "number" ||
                                      typeof val === "boolean"
                                    ) {
                                      settings[p.name] = val;
                                    }
                                  }
                                }
                                for (const [k, val] of Object.entries(
                                  pluginDefaults(impl.params),
                                )) {
                                  if (settings[k] === undefined) settings[k] = val;
                                }
                                setEditPluginSettings(settings);
                              }
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
                      <Show
                        when={editingImpl()?.plugin}
                        fallback={
                          <IndexerConfigFields
                            get={() => editForm()!}
                            patch={(v) => setEditForm((prev) => (prev ? { ...prev, ...v } : prev))}
                            showPriority
                          />
                        }
                      >
                        <PluginConfigFields
                          impl={() => editingImpl()}
                          get={() => ({
                            name: editForm()?.name ?? "",
                            settings: editPluginSettings(),
                            enable_rss: editForm()?.enable_rss ?? true,
                            enable_search: editForm()?.enable_search ?? true,
                            priority: editForm()?.priority ?? 0,
                          })}
                          patch={(v) => {
                            setEditForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    ...(v.name !== undefined ? { name: v.name } : {}),
                                    ...(v.enable_rss !== undefined
                                      ? { enable_rss: v.enable_rss }
                                      : {}),
                                    ...(v.enable_search !== undefined
                                      ? { enable_search: v.enable_search }
                                      : {}),
                                    ...(v.priority !== undefined ? { priority: v.priority } : {}),
                                  }
                                : prev,
                            );
                            if (v.settings) setEditPluginSettings(v.settings);
                          }}
                          showPriority
                        />
                      </Show>
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
                          disabled={
                            savingId() === idx.id ||
                            !editForm()?.name ||
                            !pluginComplete(editingImpl(), editPluginSettings())
                          }
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
