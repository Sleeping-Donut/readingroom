import type { MediaType, Release } from "../types";

import { api } from "./client";

export interface ScoredRelease {
	release: Release;
	score: number;
	matched_book_id?: number;
	reasons: string[];
}

export const searchIndexersForAuthor = (authorId: string, media: MediaType = "ebook") =>
	api.post<{ results: ScoredRelease[]; total: number }>(
		`/search/indexers/authors/${authorId}?media=${media}`,
	);

export const searchIndexersForBook = (bookId: number, media: MediaType = "ebook") =>
	api.post<{ results: ScoredRelease[]; total: number }>(
		`/search/indexers/books/${bookId}?media=${media}`,
	);

export const searchIndexersForTitle = (query: string, media: MediaType = "ebook") =>
	api.get<{ results: ScoredRelease[]; total: number }>(
		`/search/indexers?q=${encodeURIComponent(query)}&media=${media}`,
	);

export const downloadIndexerRelease = async (release: Release, bookId: number | undefined) => {
	const res = await api.post<{ success: boolean; error?: string; queue_id?: number }>(
		"/search/indexers/download",
		{ release, book_id: bookId },
	);
	if (!res.success) throw new Error(res.error ?? "Download failed");
	return res;
};
