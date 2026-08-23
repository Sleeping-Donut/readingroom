import { query } from "@solidjs/router";

import type { Book, Edition } from "../types";

import { api } from "./client";

/**
 * Canonical id for book detail routes = the bare OpenLibrary work/edition id
 * (e.g. "OL46125W", no "works//books/ " prefix). Strictly OL: every book —
 * tracked or metadata — carries a foreign_id, so links never use numeric DB
 * ids. Returns "" when a record somehow lacks one (data bug; fix the data).
 */
export function bookId(book: { foreign_id?: string | null }): string {
	return (book.foreign_id ?? "").replace(/^(works|books)\//, "");
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
