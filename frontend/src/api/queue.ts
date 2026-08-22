import { query } from "@solidjs/router";

import type { QueueResponse } from "../types";

import { api } from "./client";

export const getQueue = query(async () => api.get<QueueResponse>("/queue"), "queue");

export async function removeQueueEntry(id: number) {
	await api.delete(`/queue/${id}`);
}
