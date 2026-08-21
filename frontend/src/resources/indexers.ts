import { action, createOptimisticStore, createStore, refresh } from "solid-js";

import type { TestResult } from "../types";

import * as settingsApi from "../api/settings";

type ServerIndexer = Awaited<ReturnType<typeof settingsApi.listIndexers>>["indexers"][number];

export type RowError = { op: "add" | "update" | "remove"; args: unknown[] };

// Server row + optimistic affordances. tags/created_at are server-only
// metadata the optimistic temp row doesn't have yet.
export type IndexerRow = Omit<ServerIndexer, "tags" | "created_at"> & {
  tags?: string;
  created_at?: string;
  pending?: boolean;
  error?: RowError;
};

export interface IndexerInput {
  name: string;
  implementation: string;
  settings: Record<string, string | number | boolean>;
  enable_rss: boolean;
  enable_search: boolean;
  priority?: number;
}

/// Server state + mutations for the indexers settings page. The route reads
/// `indexers`/`testResults` and calls the actions; all mutation logic and
/// failed-persist bookkeeping lives here.
export function createIndexers() {
  // Failed-persist bookkeeping — scoped to this factory, touched only by the
  // actions, projected back into the list by the async projection.
  const rowErrors = new Map<number, RowError>();

  const [indexers, setIndexers] = createOptimisticStore<{ indexers: IndexerRow[] }>(
    async () => {
      const data = await settingsApi.listIndexers();
      return {
        indexers: data.indexers.map((i) => {
          const err = rowErrors.get(i.id);
          return err ? { ...i, error: err } : i;
        }),
      };
    },
    { indexers: [] },
  );

  const [testResults, setTestResults] = createStore<Record<number, TestResult>>({});

  const removeIndexer = action(function* (row: IndexerRow) {
    setIndexers((s) => {
      s.indexers = s.indexers.filter((i) => i.id !== row.id);
    });
    try {
      yield settingsApi.removeIndexer(row.id);
      rowErrors.delete(row.id);
    } catch {
      rowErrors.set(row.id, { op: "remove", args: [row] });
    }
    refresh(indexers);
  });

  const retryRemoveIndexer = action(function* (row: IndexerRow) {
    setIndexers((s) => {
      const r = s.indexers.find((x) => x.id === row.id);
      if (r) r.pending = true;
    });
    try {
      yield settingsApi.removeIndexer(row.id);
      rowErrors.delete(row.id);
    } catch {
      /* row keeps its retry affordance */
    }
    refresh(indexers);
  });

  const addIndexer = action(function* (input: IndexerInput) {
    const tempId = -Date.now();
    setIndexers((s) => {
      s.indexers.push({
        id: tempId,
        name: input.name,
        implementation: input.implementation,
        settings: JSON.stringify(input.settings),
        enable_rss: input.enable_rss,
        enable_search: input.enable_search,
        priority: input.priority ?? 0,
        pending: true,
      });
    });
    yield settingsApi.addIndexer({
      name: input.name,
      implementation: input.implementation,
      url: String(input.settings.url ?? ""),
      api_key: String(input.settings.api_key ?? ""),
      enable_rss: input.enable_rss,
      enable_search: input.enable_search,
      priority: input.priority,
      pluginSettings: input.settings,
    });
    refresh(indexers);
  });

  const updateIndexer = action(function* (id: number, input: IndexerInput) {
    setIndexers((s) => {
      const row = s.indexers.find((x) => x.id === id);
      if (row) {
        row.name = input.name;
        row.settings = JSON.stringify(input.settings);
        row.enable_rss = input.enable_rss;
        row.enable_search = input.enable_search;
        row.priority = input.priority ?? row.priority;
        row.pending = true;
      }
    });
    yield settingsApi.updateIndexer(id, {
      name: input.name,
      implementation: input.implementation,
      url: String(input.settings.url ?? ""),
      api_key: String(input.settings.api_key ?? ""),
      enable_rss: input.enable_rss,
      enable_search: input.enable_search,
      priority: input.priority,
      pluginSettings: input.settings,
    });
    refresh(indexers);
  });

  const testIndexer = action(async function* (id: number) {
    setTestResults((r) => {
      r[id] = { status: "testing" };
    });
    try {
      const data = await settingsApi.testIndexer(id);
      yield;
      setTestResults((r) => {
        r[id] = { status: data.success ? "success" : "error", message: data.message };
      });
    } catch (e) {
      setTestResults((r) => {
        r[id] = { status: "error", message: e instanceof Error ? e.message : "Test failed" };
      });
    }
  });

  const testAllIndexers = action(function* () {
    for (const idx of indexers.indexers) {
      try {
        yield testIndexer(idx.id);
      } catch {
        /* recorded by testIndexer */
      }
      yield new Promise((r) => setTimeout(r, 200));
    }
  });

  return {
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
  };
}
