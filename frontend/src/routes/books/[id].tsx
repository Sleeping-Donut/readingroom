import { createMemo, Errored, For, Loading, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { api } from "../../api/client";
import { paths } from "../../router";
import type { Book } from "../../types";

export default function BookDetail() {
  const params = useParams();

  const book = createMemo(async () => api.get<Book>(`/books/${params.id}`));

  return (
    <div>
      <a href={paths.books} class="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block">
        &larr; Back to Books
      </a>
      <Errored
        fallback={(err, reset) => (
          <p class="text-sm text-red-400 mt-2">
            Failed to load: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
          <Title>{book().title} · ReadingRoom</Title>
          <div class="flex gap-8 mt-4">
            <Show when={book().image_url}>
              {(img) => (
                <img
                  src={img()}
                  alt={book().title}
                  class="w-48 h-72 object-cover rounded-lg shadow-lg"
                />
              )}
            </Show>
            <div class="flex-1">
              <h2 class="text-3xl font-bold mb-2">{book().title}</h2>
              <div class="flex gap-4 text-sm text-gray-400 mb-4">
                <span>Author ID: {book().author_id}</span>
                <Show when={book().publish_date}>
                  <span>Published: {book().publish_date}</span>
                </Show>
                <Show when={book().language}>
                  <span>Language: {book().language}</span>
                </Show>
                <Show when={book().pages}>
                  <span>Pages: {book().pages}</span>
                </Show>
                <Show when={book().isbn}>
                  <span>ISBN: {book().isbn}</span>
                </Show>
              </div>
              <Show when={book().description}>
                <p class="text-gray-300 leading-relaxed">{book().description}</p>
              </Show>
              <Show when={book().genres.length > 0}>
                <div class="mt-4 flex gap-2 flex-wrap">
                  <For each={book().genres}>
                    {(g) => (
                      <span class="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300">{g}</span>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Loading>
      </Errored>
    </div>
  );
}
