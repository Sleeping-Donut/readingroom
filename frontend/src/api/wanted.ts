import { query } from "@solidjs/router";
import { api } from "./client";
import type { WantedResponse } from "../types";

export const getWanted = query(async () => api.get<WantedResponse>("/wanted"), "wanted");

export async function searchWantedAll() {
  await api.post("/wanted/search");
}

export async function searchWantedBook(id: number) {
  await api.post(`/wanted/search/${id}`);
}
