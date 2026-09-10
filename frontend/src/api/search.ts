import type { Release } from "../types";

import { api } from "./client";

export interface ScoredRelease {
	release: Release;
	score: number;
	matched_book_id?: number;
	reasons: string[];
}

export const searchIndexersForAuthor = (authorId: string) =>
	api.post<{ results: ScoredRelease[]; total: number }>(`/search/indexers/authors/${authorId}`);

export const searchIndexersForBook = (bookId: number) =>
	api.post<{ results: ScoredRelease[]; total: number }>(`/search/indexers/books/${bookId}`);

export const searchIndexersForTitle = (query: string) =>
	api.get<{ results: ScoredRelease[]; total: number }>(
		`/search/indexers?q=${encodeURIComponent(query)}`,
	);

export const downloadIndexerRelease = async (release: Release, bookId: number | undefined) => {
	const res = await api.post<{ success: boolean; error?: string; queue_id?: number }>(
		"/search/indexers/download",
		{ release, book_id: bookId },
	);
	if (!res.success) throw new Error(res.error ?? "Download failed");
	return res;
};
