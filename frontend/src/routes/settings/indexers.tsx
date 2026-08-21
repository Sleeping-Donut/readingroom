import { Title } from "@solidjs/meta";
import { useBeforeLeave, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
  Errored,
  For,
  Loading,
  Show,
  createEffect,
  createMemo,
  createOptimistic,
  createSignal,
  createStore,
} from "solid-js";

import type { ImplementationInfo } from "../../api/settings";
import type { Draft } from "../../resources/indexers";

import * as settingsApi from "../../api/settings";
import { IndexerCard } from "../../components/settings/IndexerCard";
import { IndexerEditPanel } from "../../components/settings/IndexerEditPanel";
import {
  CORE_IMPLEMENTATIONS,
  createIndexers,
  draftFor,
  toInput,
  validateDraft,
} from "../../resources/indexers";

export const route = defineFileRoute("/settings/indexers", {
  info: { label: "Indexers" },
  preload: () => {
    void settingsApi.listIndexers();
    void settingsApi.getIndexerImplementations();
  },
});

export default function IndexersTab(_props: RouteProps<typeof route>) {
  const [
    indexers,
    { addIndexer, updateIndexer, removeIndexer, retryRemoveIndexer, testIndexer, testAllIndexers },
  ] = createIndexers();

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
    return validateDraft(impl, draft).success;
  });

  const editValid = createMemo(() => {
    const impl = editingImpl();
    if (!editing() || !impl) return false;
    return validateDraft(impl, draft).success;
  });

  const submitAdd = async () => {
    const impl = configureImpl();
    if (!impl) return;
    const parsed = validateDraft(impl, draft);
    if (!parsed.success) {
      setActionError(parsed.error ?? "Invalid indexer settings");
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
    const parsed = validateDraft(impl, draft);
    if (!parsed.success) {
      setActionError(parsed.error ?? "Invalid indexer settings");
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

  const startEdit = (idx: (typeof indexers.indexers)[number]) => {
    const impl = implById(idx.implementation);
    if (!impl) return;
    setEditing({ id: idx.id, implId: impl.id });
    setDraft(() => draftFor(impl, idx));
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
                <IndexerEditPanel
                  impl={configureImpl()!}
                  draft={draft}
                  setDraft={setDraft}
                  showPriority={false}
                  submitting={submitting()}
                  valid={addValid()}
                  onCancel={() => setAddStep("closed")}
                  onSave={() => void submitAdd()}
                />
                <div class="flex gap-3 items-center mt-4">
                  <button
                    onClick={() => setAddStep("pick")}
                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                  >
                    Back
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
                      <IndexerCard
                        idx={idx}
                        implLabel={implById(idx.implementation)?.label ?? idx.implementation}
                        onTest={() => void testIndexer(idx.id)}
                        onEdit={() => startEdit(idx)}
                        onRemove={() => void removeIndexer(idx)}
                        onRetry={() => void retryRemoveIndexer(idx)}
                      />
                    }
                  >
                    <IndexerEditPanel
                      impl={editingImpl()!}
                      draft={draft}
                      setDraft={setDraft}
                      showPriority
                      submitting={submitting()}
                      valid={editValid()}
                      onCancel={() => setEditing(null)}
                      onSave={() => void submitEdit()}
                    />
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
