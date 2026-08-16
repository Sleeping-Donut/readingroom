import { query } from "@solidjs/router";

import type { WantedResponse } from "../types";

import { api } from "./client";

export const getWanted = query(async () => api.get<WantedResponse>("/wanted"), "wanted");

export async function searchWantedAll() {
  await api.post("/wanted/search");
}

export async function searchWantedBook(id: number) {
  await api.post(`/wanted/search/${id}`);
}
