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

export const downloadIndexerRelease = (release: Release, bookId: number | undefined) =>
  api.post("/search/indexers/download", { release, book_id: bookId });
