import { action, createOptimisticStore, createStore, createProjection, refresh } from "solid-js";

import type { TestResult } from "../types";

import * as settingsApi from "../api/settings";

type ServerIndexer = Awaited<ReturnType<typeof settingsApi.listIndexers>>["indexers"][number];

export type RowError = { op: "add" | "update" | "remove"; args: unknown[] };

// Wire row minus server-only metadata the optimistic temp row can't provide,
// plus the optimistic in-flight flag (written during actions, reverted on settle).
type StoredIndexer = Omit<ServerIndexer, "tags" | "created_at"> & {
  pending?: boolean;
};

// Projected row: stored fields + client affordances layered by the projection.
export type IndexerRow = StoredIndexer & {
  error?: RowError;
  test?: TestResult;
};

export interface IndexerInput {
  name: string;
  implementation: string;
  settings: Record<string, string | number | boolean>;
  enable_rss: boolean;
  enable_search: boolean;
  priority?: number;
}

/// Server state + mutations for the indexers settings page. Returns the
/// projected indexer list (server rows with pending/error/test affordances
/// layered on) plus the actions; the route holds no other state.
export function createIndexers() {
  // Failed-persist bookkeeping — scoped to this factory, touched only by the
  // actions, layered back onto rows by the projection.
  const rowErrors = new Map<number, RowError>();

  // Authoritative server rows (+optimistic overlay during actions).
  const [serverRows, setServerRows] = createOptimisticStore<{ indexers: StoredIndexer[] }>(
    async () => {
      const data = await settingsApi.listIndexers();
      return { indexers: data.indexers };
    },
    { indexers: [] },
  );

  const [testResults, setTestResults] = createStore<Record<number, TestResult>>({});

  // Projected view: server rows with affordances layered per row.
  const indexers = createProjection(
    () => ({
      indexers: serverRows.indexers.map((row) => ({
        ...row,
        error: rowErrors.get(row.id),
        test: testResults[row.id],
      })),
    }),
    { indexers: [] },
  );

  const removeIndexer = action(function* (row: IndexerRow) {
    setServerRows((s) => {
      s.indexers = s.indexers.filter((i) => i.id !== row.id);
    });
    try {
      yield settingsApi.removeIndexer(row.id);
      rowErrors.delete(row.id);
    } catch {
      rowErrors.set(row.id, { op: "remove", args: [row] });
    }
    refresh(serverRows);
  });

  const retryRemoveIndexer = action(function* (row: IndexerRow) {
    setServerRows((s) => {
      const r = s.indexers.find((x) => x.id === row.id);
      if (r) r.pending = true;
    });
    try {
      yield settingsApi.removeIndexer(row.id);
      rowErrors.delete(row.id);
    } catch {
      /* row keeps its retry affordance */
    }
    refresh(serverRows);
  });

  const addIndexer = action(function* (input: IndexerInput) {
    const tempId = -Date.now();
    setServerRows((s) => {
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
    refresh(serverRows);
  });

  const updateIndexer = action(function* (id: number, input: IndexerInput) {
    setServerRows((s) => {
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
    refresh(serverRows);
  });

  const testIndexer = action(function* (id: number) {
    setTestResults((r) => {
      r[id] = { status: "testing" };
    });
    try {
      const data = yield settingsApi.testIndexer(id);
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
    for (const idx of serverRows.indexers) {
      try {
        yield testIndexer(idx.id);
      } catch {
        /* recorded by testIndexer */
      }
      yield new Promise((r) => setTimeout(r, 200));
    }
  });

  return [
    indexers,
    {
      addIndexer,
      updateIndexer,
      removeIndexer,
      retryRemoveIndexer,
      testIndexer,
      testAllIndexers,
    },
  ] as const;
}
