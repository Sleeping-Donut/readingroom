import { query } from "@solidjs/router";

import type { Author, Book } from "../types";

import { api } from "./client";

/**
 * Canonical id for author detail routes = the bare OpenLibrary author id
 * (e.g. "OL123A", no "authors/" prefix). Strictly OL: every author carries a
 * foreign_id, so links never use numeric DB ids. Returns "" when a record
 * somehow lacks one (data bug; fix the data).
 */
export function authorId(author: { foreign_id?: string | null }): string {
	return (author.foreign_id ?? "").replace(/^authors\//, "");
}

export const getAuthors = query(
	async () => api.get<{ authors: Author[]; total: number }>("/authors"),
	"authors",
);

export const getAuthor = query(async (id: string) => api.get<Author>(`/authors/${id}`), "author");

export const getAuthorBooks = query(
	async (id: string) => api.get<{ books: Book[] }>(`/authors/${encodeURIComponent(id)}/books`),
	"author-books",
);

export const searchAuthors = (q: string) =>
	api.get<{ authors: Author[]; total: number }>(`/authors/search?q=${encodeURIComponent(q)}`);

export const addAuthor = (author: { foreign_id: string; name: string }) =>
	api.post("/authors", author);
