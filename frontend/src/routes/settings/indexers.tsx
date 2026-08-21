import { Title } from "@solidjs/meta";
import { useBeforeLeave, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
  Errored,
  For,
  Loading,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createOptimistic,
  createSignal,
  createStore,
} from "solid-js";
import * as v from "valibot";

import type { ImplementationInfo, IndexerParamDef } from "../../api/settings";

import * as settingsApi from "../../api/settings";
import StatusDot from "../../components/settings/StatusDot";
import { createIndexers, type IndexerInput, type IndexerRow } from "../../resources/indexers";

export const route = defineFileRoute("/settings/indexers", {
  info: { label: "Indexers" },
  preload: () => {
    void settingsApi.listIndexers();
    void settingsApi.getIndexerImplementations();
  },
});

// Offline fallback while /settings/indexers/implementations loads. Params mirror
// backend core_implementations() so the config form is data-driven either way.
const CORE_IMPLEMENTATIONS: ImplementationInfo[] = [
  {
    id: "torznab",
    label: "Torznab (torrent)",
    hint: "Torrent indexer using the Torznab protocol.",
    supports_search: true,
    supports_rss: true,
    plugin: false,
    params: [
      { name: "url", label: "URL", type: "string", required: true, options: [] },
      { name: "api_key", label: "API Key", type: "password", required: false, options: [] },
    ],
  },
  {
    id: "newznab",
    label: "Newznab (usenet)",
    hint: "Usenet indexer using the Newznab protocol.",
    supports_search: true,
    supports_rss: true,
    plugin: false,
    params: [
      { name: "url", label: "URL", type: "string", required: true, options: [] },
      { name: "api_key", label: "API Key", type: "password", required: false, options: [] },
    ],
  },
  {
    id: "rss",
    label: "RSS",
    hint: "RSS feed indexer — API key is not required.",
    supports_search: false,
    supports_rss: true,
    plugin: false,
    params: [{ name: "url", label: "Feed URL", type: "string", required: true, options: [] }],
  },
];

function paramSchema(p: IndexerParamDef) {
  switch (p.type) {
    case "number":
      return p.required ? v.number(`${p.label || p.name} is required`) : v.optional(v.number());
    case "boolean":
      return v.boolean();
    case "select":
      return p.options.length
        ? v.optional(v.picklist(p.options as [string, ...string[]]))
        : v.optional(v.string());
    default:
      return p.required
        ? v.pipe(v.string(), v.trim(), v.minLength(1, `${p.label || p.name} is required`))
        : v.optional(v.string());
  }
}

function implSchema(impl: ImplementationInfo) {
  return v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(1, "Name is required")),
    ...Object.fromEntries(impl.params.map((p) => [p.name, paramSchema(p)])),
  });
}

interface Draft {
  name: string;
  values: Record<string, string | number | boolean>;
  enable_rss: boolean;
  enable_search: boolean;
  priority: number;
}

function paramDefault(p: IndexerParamDef): string | number | boolean | undefined {
  if (p.default !== undefined) return p.default;
  if (p.type === "boolean") return false;
  if (p.type === "select") return p.options[0];
  return undefined;
}

function draftFor(impl: ImplementationInfo, row?: IndexerRow): Draft {
  let raw: Record<string, string | number | boolean> = {};
  if (row) {
    try {
      raw = JSON.parse(row.settings);
    } catch {
      raw = {};
    }
  }
  const values: Draft["values"] = {};
  for (const p of impl.params) {
    const seed = raw[p.name] ?? paramDefault(p);
    if (seed !== undefined) values[p.name] = seed;
  }
  return {
    name: row?.name ?? "",
    values,
    enable_rss: row?.enable_rss ?? impl.supports_rss,
    enable_search: row?.enable_search ?? impl.supports_search,
    priority: row?.priority ?? 0,
  };
}

function toInput(impl: ImplementationInfo, draft: Draft): IndexerInput {
  return {
    name: draft.name.trim(),
    implementation: impl.id,
    settings: draft.values,
    enable_rss: draft.enable_rss,
    enable_search: draft.enable_search,
    priority: draft.priority,
  };
}

/// One data-driven config form for every implementation: common fields plus a
/// generated field per declared param, toggles gated by declared capabilities.
function ConfigFields(props: {
  impl: ImplementationInfo;
  draft: Draft;
  setDraft: (mutate: (d: Draft) => void) => void;
  showPriority: boolean;
}) {
  const inputClass = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm";
  const setValue = (name: string, value: string | number | boolean) =>
    props.setDraft((d) => {
      d.values[name] = value;
    });

  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Name</label>
        <input
          value={props.draft.name}
          onInput={(e) =>
            props.setDraft((d) => {
              d.name = e.currentTarget.value;
            })
          }
          class={inputClass}
          placeholder="My Indexer"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Type</label>
        <p class="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-300">
          {props.impl.label}
        </p>
        <p class="mt-1 text-xs text-gray-500">{props.impl.hint}</p>
      </div>
      <For each={props.impl.params}>
        {(p) => (
          <div class={p.type === "string" || p.type === "password" ? "sm:col-span-2" : ""}>
            <Show
              when={p.type === "boolean"}
              fallback={
                <>
                  <label class="block text-xs text-gray-400 mb-1">
                    {p.label || p.name}
                    {p.required ? " *" : ""}
                  </label>
                  <Switch>
                    <Match when={p.type === "password"}>
                      <input
                        type="password"
                        value={String(props.draft.values[p.name] ?? "")}
                        onInput={(e) => setValue(p.name, e.currentTarget.value)}
                        class={inputClass}
                        placeholder="Optional"
                      />
                    </Match>
                    <Match when={p.type === "number"}>
                      <input
                        type="number"
                        value={String(props.draft.values[p.name] ?? "")}
                        onInput={(e) => setValue(p.name, Number(e.currentTarget.value))}
                        class={inputClass}
                      />
                    </Match>
                    <Match when={p.type === "select"}>
                      <select
                        value={String(props.draft.values[p.name] ?? "")}
                        onChange={(e) => setValue(p.name, e.currentTarget.value)}
                        class={inputClass}
                      >
                        <For each={p.options}>{(opt) => <option value={opt}>{opt}</option>}</For>
                      </select>
                    </Match>
                    <Match when={p.type === "string"}>
                      <input
                        type="text"
                        value={String(props.draft.values[p.name] ?? "")}
                        onInput={(e) => setValue(p.name, e.currentTarget.value)}
                        class={inputClass}
                        placeholder={p.default !== undefined ? String(p.default) : undefined}
                      />
                    </Match>
                  </Switch>
                </>
              }
            >
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(props.draft.values[p.name])}
                  onChange={(e) => setValue(p.name, e.currentTarget.checked)}
                  class="rounded bg-gray-800 border-gray-700"
                />
                {p.label || p.name}
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
            value={props.draft.priority}
            onInput={(e) =>
              props.setDraft((d) => {
                d.priority = Number(e.currentTarget.value);
              })
            }
            class={inputClass}
          />
        </div>
      </Show>
      <div class="sm:col-span-2 flex items-end gap-6">
        <Show when={props.impl.supports_rss}>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.draft.enable_rss}
              onChange={(e) =>
                props.setDraft((d) => {
                  d.enable_rss = e.currentTarget.checked;
                })
              }
              class="rounded bg-gray-800 border-gray-700"
            />
            Enable RSS
          </label>
        </Show>
        <Show when={props.impl.supports_search}>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.draft.enable_search}
              onChange={(e) =>
                props.setDraft((d) => {
                  d.enable_search = e.currentTarget.checked;
                })
              }
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
  const {
    indexers,
    testResults,
    actions: {
      addIndexer,
      updateIndexer,
      removeIndexer,
      retryRemoveIndexer,
      testIndexer,
      testAllIndexers,
    },
  } = createIndexers();

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

  const implById = (id: string) => implementationList().find((i) => i.id === id) ?? null;

  // Add wizard: "closed" -> "pick" -> "configure".
  const [addStep, setAddStep] = createSignal<"closed" | "pick" | "configure">("closed");
  const [configureImplId, setConfigureImplId] = createSignal<string | null>(null);
  const configureImpl = createMemo(() => (configureImplId() ? implById(configureImplId()!) : null));

  // Edit-in-place.
  const [editing, setEditing] = createSignal<{ id: number; implId: string } | null>(null);
  const editingImpl = createMemo(() => (editing() ? implById(editing()!.implId) : null));

  // One draft store serves both flows; reseeded when a flow opens.
  const [draft, setDraft] = createStore<Draft>({
    name: "",
    values: {},
    enable_rss: true,
    enable_search: true,
    priority: 0,
  });
  const [submitting, setSubmitting] = createSignal(false);
  const [isTestingAll, setIsTestingAll] = createOptimistic(false);
  const [actionError, setActionError] = createSignal<string | null>(null);

  const runTestAll = async () => {
    setIsTestingAll(true);
    try {
      await testAllIndexers();
    } finally {
      setIsTestingAll(false);
    }
  };

  useBeforeLeave((event) => {
    if (!editing()) return;
    event.preventDefault();
    if (window.confirm("Discard unsaved changes?")) event.retry(true);
  });

  // Auto-test each indexer once after the first load (imperative boundary).
  const [autoTested, setAutoTested] = createSignal(false);
  createEffect(
    () => indexers.indexers,
    (list) => {
      if (autoTested() || list.length === 0) return;
      setAutoTested(true);
      const timers = list.map((idx, i) => setTimeout(() => void testIndexer(idx.id), i * 300));
      return () => timers.forEach(clearTimeout);
    },
  );

  const addValid = createMemo(() => {
    const impl = configureImpl();
    if (!impl) return false;
    return v.safeParse(implSchema(impl), { name: draft.name, ...draft.values }).success;
  });

  const editValid = createMemo(() => {
    const impl = editingImpl();
    if (!editing() || !impl) return false;
    return v.safeParse(implSchema(impl), { name: draft.name, ...draft.values }).success;
  });

  const submitAdd = async () => {
    const impl = configureImpl();
    if (!impl) return;
    const parsed = v.safeParse(implSchema(impl), { name: draft.name, ...draft.values });
    if (!parsed.success) {
      setActionError(parsed.issues[0]?.message ?? "Invalid indexer settings");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await addIndexer(toInput(impl, { ...draft, name: parsed.output.name }));
      setAddStep("closed");
      setDraft(() => draftFor(impl));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async () => {
    const editingState = editing();
    const impl = editingImpl();
    if (!editingState || !impl) return;
    const parsed = v.safeParse(implSchema(impl), { name: draft.name, ...draft.values });
    if (!parsed.success) {
      setActionError(parsed.issues[0]?.message ?? "Invalid indexer settings");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await updateIndexer(editingState.id, toInput(impl, { ...draft, name: parsed.output.name }));
      setEditing(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

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
                  onClick={() => void runTestAll()}
                  disabled={isTestingAll()}
                  class="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                >
                  {isTestingAll() ? "Testing All..." : "Test All"}
                </button>
              </Show>
              <button
                onClick={() => setAddStep(addStep() === "closed" ? "pick" : "closed")}
                class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
              >
                {addStep() !== "closed" ? "Cancel" : "Add Indexer"}
              </button>
            </div>
          </div>

          <Show when={actionError()}>
            <p class="text-sm text-red-400 mt-2">{actionError()}</p>
          </Show>

          <Show when={addStep() !== "closed"}>
            <div class="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <Show
                when={addStep() === "configure"}
                fallback={
                  <>
                    <h4 class="text-sm font-semibold text-gray-300 mb-3">Indexer type</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <For each={implementationList()}>
                        {(impl) => (
                          <button
                            onClick={() => {
                              setConfigureImplId(impl.id);
                              setDraft(() => draftFor(impl));
                              setAddStep("configure");
                            }}
                            class="p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-indigo-600 rounded-lg text-left transition-colors"
                          >
                            <p class="font-medium">{impl.label}</p>
                            <p class="text-xs text-gray-500 mt-1">{impl.hint}</p>
                          </button>
                        )}
                      </For>
                    </div>
                  </>
                }
              >
                <ConfigFields
                  impl={configureImpl()!}
                  draft={draft}
                  setDraft={setDraft}
                  showPriority={false}
                />
                <div class="flex gap-3 items-center mt-4">
                  <button
                    onClick={() => setAddStep("pick")}
                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void submitAdd()}
                    disabled={submitting() || !addValid()}
                    class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setAddStep("closed")}
                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                  >
                    Cancel
                  </button>
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
                    when={editing()?.id === idx.id}
                    fallback={
                      <div
                        class={[
                          "flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-900 rounded-lg border transition-colors",
                          { "border-red-800": !!idx.error, "border-gray-800": !idx.error },
                        ]}
                      >
                        <StatusDot status={testResults[idx.id]?.status ?? "idle"} />
                        <div class="flex-1 min-w-0">
                          <p class="font-medium truncate">{idx.name}</p>
                          <div class="flex flex-wrap gap-1.5 mt-1">
                            <span class="text-xs bg-indigo-900/40 text-indigo-400 border border-indigo-800 rounded px-1.5 py-0.5">
                              {implById(idx.implementation)?.label ?? idx.implementation}
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
                          <Show when={testResults[idx.id]}>
                            <Switch>
                              <Match when={testResults[idx.id]?.status === "success"}>
                                <p class="text-xs text-green-400 mt-1">
                                  ✓ {testResults[idx.id]?.message}
                                </p>
                              </Match>
                              <Match when={testResults[idx.id]?.status === "error"}>
                                <p class="text-xs text-red-400 mt-1">
                                  ✗ {testResults[idx.id]?.message}
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
                            disabled={testResults[idx.id]?.status === "testing"}
                            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
                          >
                            {testResults[idx.id]?.status === "testing" ? "Testing..." : "Test"}
                          </button>
                          <button
                            onClick={() => {
                              const impl = implById(idx.implementation);
                              if (!impl) return;
                              setEditing({ id: idx.id, implId: impl.id });
                              setDraft(() => draftFor(impl, idx));
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
                              disabled={idx.pending}
                              class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
                            >
                              {idx.pending ? "Retrying..." : "Retry"}
                            </button>
                          </Show>
                        </div>
                      </div>
                    }
                  >
                    <div class="p-3 bg-gray-900 rounded-lg border border-gray-800">
                      <ConfigFields
                        impl={editingImpl()!}
                        draft={draft}
                        setDraft={setDraft}
                        showPriority
                      />
                      <div class="flex gap-2 mt-3 justify-end">
                        <button
                          onClick={() => setEditing(null)}
                          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void submitEdit()}
                          disabled={submitting() || !editValid()}
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
