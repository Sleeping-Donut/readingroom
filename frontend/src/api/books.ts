import { query } from "@solidjs/router";
import { api } from "./client";
import type { Book } from "../types";

export const getBooks = query(
  async () => api.get<{ books: Book[]; total: number }>("/books"),
  "books",
);

export const getBook = query(async (id: string) => api.get<Book>(`/books/${id}`), "book");

export const searchBooks = (q: string) =>
  api.get<{ books: Book[]; total: number }>(`/books/search?q=${encodeURIComponent(q)}`);

export const addBook = (book: { foreign_id: string; author_id: number; title: string }) =>
  api.post("/books", book);
