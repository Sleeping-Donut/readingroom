import { query } from "@solidjs/router";

import type { Author, Book } from "../types";

import { api } from "./client";

/**
 * Canonical id for author detail routes = the bare OpenLibrary author id
 * (e.g. "OL123A", no "authors/" prefix). Falls back to the numeric DB id.
 */
export function authorId(author: { id: number; foreign_id?: string | null }): string {
  const foreign = author.foreign_id ?? "";
  if (foreign) return foreign.replace(/^authors\//, "");
  return String(author.id);
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
