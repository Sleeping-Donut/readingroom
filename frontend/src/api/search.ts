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

export const downloadIndexerRelease = (release: Release, bookId: number | undefined) =>
	api.post("/search/indexers/download", { release, book_id: bookId });
