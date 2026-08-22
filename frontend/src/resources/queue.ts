import { revalidate } from "@solidjs/router";
import { action, createOptimisticStore, createProjection } from "solid-js";

import type { QueueEntry } from "../types";

import * as queueApi from "../api/queue";

export type RowError = { op: "remove"; args: unknown[] };

// Wire row minus the legacy lossy error flag (the projection layers a typed
// one), plus the optimistic in-flight flag (written during actions, reverted
// on settle).
type StoredEntry = Omit<QueueEntry, "error"> & { pending?: boolean };

// Projected row: stored fields + client affordances layered by the projection.
export type QueueRow = Omit<QueueEntry, "error"> & {
	pending?: boolean;
	error?: RowError;
};

/// Server state + mutations for the download queue. WS push and polling call
/// `revalidate(getQueue.key)` upstream; this store's source rides that query.
export function createQueue() {
	// Failed-persist bookkeeping — scoped to this factory, touched only by the
	// actions, layered back onto rows by the projection.
	const rowErrors = new Map<number, RowError>();

	// Authoritative server rows (+optimistic overlay during actions).
	const [serverRows, setServerRows] = createOptimisticStore<{
		queue: StoredEntry[];
		total: number;
	}>(
		async () => {
			const data = await queueApi.getQueue();
			return data;
		},
		{ queue: [], total: 0 },
	);

	// Projected view: server rows with affordances layered per row.
	const queue = createProjection(
		() => ({
			...serverRows,
			queue: serverRows.queue.map((row) => ({
				...row,
				error: rowErrors.get(row.id),
			})),
		}),
		{ queue: [], total: 0 },
	);

	const remove = action(function* (row: QueueRow) {
		// Optimistic: drop the row immediately.
		setServerRows((s) => {
			s.queue = s.queue.filter((e) => e.id !== row.id);
		});
		try {
			yield queueApi.removeQueueEntry(row.id);
			rowErrors.delete(row.id);
		} catch {
			rowErrors.set(row.id, { op: "remove", args: [row] });
		}
		// Revalidate rather than refresh: the query retriggers its live consumers,
		// including this store's source.
		revalidate(queueApi.getQueue.key);
	});

	const retryRemove = action(function* (id: number) {
		setServerRows((s) => {
			const r = s.queue.find((e) => e.id === id);
			if (r) r.pending = true;
		});
		try {
			yield queueApi.removeQueueEntry(id);
			rowErrors.delete(id);
		} catch {
			/* row keeps its retry affordance */
		}
		revalidate(queueApi.getQueue.key);
	});

	return [queue, { remove, retryRemove }] as const;
}
