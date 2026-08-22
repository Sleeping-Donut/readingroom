import { revalidate } from "@solidjs/router";
import { action, createOptimisticStore, refresh } from "solid-js";

import type { Author } from "../types";

import * as authorsApi from "../api/authors";

// Wire row plus the optimistic in-flight flag (written during actions,
// reverted on settle).
export type StoredAuthor = Author & { pending?: boolean };

/// Server state + mutations for the tracked-authors list. A freshly added
/// author appears immediately as a temp row flagged `pending`, then settles
/// onto the real server row when the store refreshes.
export function createAuthors() {
  // Authoritative server rows (+optimistic overlay during actions).
  const [serverRows, setServerRows] = createOptimisticStore<{ authors: StoredAuthor[] }>(
    async () => {
      const data = await authorsApi.getAuthors();
      return { authors: data.authors };
    },
    { authors: [] },
  );

  const addAuthor = action(function* (input: { foreign_id: string; name: string }) {
    const tempId = -Date.now();
    setServerRows((s) => {
      s.authors.push({
        id: tempId,
        foreign_id: input.foreign_id,
        name: input.name,
        genres: [],
        aliases: [],
        links: [],
        monitored: true,
        tags: [],
        added_at: new Date().toISOString(),
        pending: true,
      });
    });
    yield authorsApi.addAuthor(input);
    // The store sources through the router query cache; invalidate it first
    // so the refresh below sees the new row rather than a stale entry.
    yield revalidate(authorsApi.getAuthors.key);
    refresh(serverRows);
  });

  return [serverRows, { addAuthor }] as const;
}
