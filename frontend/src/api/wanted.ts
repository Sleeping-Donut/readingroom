import { query } from "@solidjs/router";

import type { MediaType, WantedResponse } from "../types";

import { api } from "./client";

export const getWanted = query(async () => api.get<WantedResponse>("/wanted"), "wanted");

/// Omit `media` to search both media (the split button's main action).
export async function searchWantedAll(media?: MediaType) {
	await api.post(media ? `/wanted/search?media=${media}` : "/wanted/search");
}

export async function searchWantedBook(id: number, media?: MediaType) {
	await api.post(media ? `/wanted/search/${id}?media=${media}` : `/wanted/search/${id}`);
}

export async function automaticSearchBook(id: number, media?: MediaType) {
	return api.post<{
		status: string;
		message?: string;
		queue_id?: number;
		score?: number;
	}>(media ? `/wanted/search/${id}?media=${media}` : `/wanted/search/${id}`);
}
