import { query } from "@solidjs/router";

import type { Book, Edition } from "../types";

import { api } from "./client";

/**
 * Universal id used for book detail routes: first non-empty of isbn13, isbn,
 * asin, foreign_id, falling back to the numeric DB id. Kept as-is — the router
 * encoding handles slashes for foreign ids.
 */
export function bookId(book: {
	id: number;
	isbn13?: string | null;
	isbn?: string | null;
	asin?: string | null;
	foreign_id?: string | null;
}): string {
	// Canonical id = the OpenLibrary work/edition id (bare, no works//books/
	// prefix). ISBN/ASIN remain resolvable as input aliases via the backend,
	// but links key off the stable OL id.
	const foreign = book.foreign_id ?? "";
	if (foreign) return foreign.replace(/^(works|books)\//, "");
	return String(book.id);
}

export const getBooks = query(
	async () => api.get<{ books: Book[]; total: number }>("/books"),
	"books",
);

export const getBook = query(
	async (id: string) => api.get<Book>(`/books/${encodeURIComponent(id)}`),
	"book",
);

export const searchBooks = (q: string) =>
	api.get<{ books: Book[]; total: number }>(`/books/search?q=${encodeURIComponent(q)}`);

export const addBook = (book: {
	foreign_id: string;
	author_id: number;
	title: string;
	author_name?: string;
}) => api.post<{ book: Book; already_exists: boolean }>("/books", book);

export const getBookEditions = (id: string) =>
	api.get<{ editions: Edition[]; total: number }>(`/books/${encodeURIComponent(id)}/editions`);

export const updateBookMonitored = (id: number, monitored: boolean) =>
	api.put<{ success: boolean }>(`/books/${id}`, { monitored });
