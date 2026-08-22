import { revalidate } from "@solidjs/router";
import { action, createOptimisticStore, refresh } from "solid-js";

import type { Book } from "../types";

import * as booksApi from "../api/books";

// Wire row plus the optimistic in-flight flag (written during actions,
// reverted on settle).
export type StoredBook = Book & { pending?: boolean };

export interface AddBookInput {
  foreign_id: string;
  author_id: number;
  title: string;
  author_name?: string;
}

/// Server state + mutations for the tracked-books list. A freshly added book
/// appears immediately as a temp row flagged `pending`, then settles onto the
/// real server row when the store refreshes.
export function createBooks() {
  // Authoritative server rows (+optimistic overlay during actions).
  const [serverRows, setServerRows] = createOptimisticStore<{ books: StoredBook[] }>(
    async () => {
      const data = await booksApi.getBooks();
      return { books: data.books };
    },
    { books: [] },
  );

  const addBook = action(function* (input: AddBookInput) {
    const tempId = -Date.now();
    setServerRows((s) => {
      s.books.push({
        id: tempId,
        foreign_id: input.foreign_id,
        author_id: input.author_id,
        title: input.title,
        clean_title: input.title,
        genres: [],
        language: "",
        monitored: true,
        added_at: new Date().toISOString(),
        author_name: input.author_name,
        pending: true,
      });
    });
    yield booksApi.addBook(input);
    // The store sources through the router query cache; invalidate it first
    // so the refresh below sees the new row rather than a stale entry.
    yield revalidate(booksApi.getBooks.key);
    refresh(serverRows);
  });

  return [serverRows, { addBook }] as const;
}
