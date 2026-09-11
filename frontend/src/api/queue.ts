import { query } from "@solidjs/router";

import type { ImportCandidate, ImportMode, ImportResult, QueueResponse } from "../types";

import { api } from "./client";

export const getQueue = query(async () => api.get<QueueResponse>("/queue"), "queue");

export async function removeQueueEntry(id: number) {
	await api.delete(`/queue/${id}`);
}

/// Scan a completed download for files that need manual mapping.
export async function getImportCandidates(queueId: number) {
	return api.get<{ candidates: ImportCandidate[]; total: number }>(
		`/queue/${queueId}/candidates`,
	);
}

/// Import the user-resolved candidates for a queue entry.
export async function importQueueCandidates(
	queueId: number,
	items: { path: string; book_id: number }[],
	importMode: ImportMode,
) {
	return api.post<ImportResult>(`/queue/${queueId}/import`, {
		items,
		import_mode: importMode,
	});
}
