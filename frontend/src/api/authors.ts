import { query } from "@solidjs/router";

import type { Author, Book } from "../types";

import { api } from "./client";

export const getAuthors = query(
  async () => api.get<{ authors: Author[]; total: number }>("/authors"),
  "authors",
);

export const getAuthor = query(async (id: string) => api.get<Author>(`/authors/${id}`), "author");

export const getAuthorBooks = query(
  async (id: number) => api.get<{ books: Book[] }>(`/authors/${id}/books`),
  "author-books",
);

export const searchAuthors = (q: string) =>
  api.get<{ authors: Author[]; total: number }>(`/authors/search?q=${encodeURIComponent(q)}`);

export const addAuthor = (author: { foreign_id: string; name: string }) =>
  api.post("/authors", author);
