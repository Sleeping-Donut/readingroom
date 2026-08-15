import { query } from "@solidjs/router";
import { api } from "./client";
import type { QueueResponse } from "../types";

export const getQueue = query(async () => api.get<QueueResponse>("/queue"), "queue");

export async function removeQueueEntry(id: number) {
  await api.delete(`/queue/${id}`);
}
