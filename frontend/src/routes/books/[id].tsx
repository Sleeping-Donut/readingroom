import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { createMemo, Errored, For, Loading, Show } from "solid-js";

import { getBook } from "../../api/books";
import { BookCover } from "../../components/books/BookCover";
import { StatusBadge } from "../../components/books/StatusBadge";
import { paths } from "../../router";

export const route = defineFileRoute("/books/:id", {
  preload: ({ params }) => getBook(params.id),
});

function InfoRow(props: { label: string; value?: string | number }) {
  return (
    <Show when={props.value}>
      <div class="flex justify-between py-2 border-b border-gray-800">
        <span class="text-xs text-gray-400">{props.label}</span>
        <span class="text-sm text-right">{props.value}</span>
      </div>
    </Show>
  );
}

export default function BookDetail() {
  const params = useParams(paths.books);

  const book = createMemo(() => getBook(params.id));

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
          <div class="flex flex-col sm:flex-row gap-6 sm:gap-8 mt-4">
            <BookCover
              src={book().image_url}
              alt={book().title}
              class="w-40 sm:w-48 aspect-[2/3] rounded-lg shadow-lg shrink-0"
              emojiClass="text-5xl"
            />
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-3 mb-1">
                <h2 class="text-3xl font-bold">{book().title}</h2>
                <StatusBadge status={book().status} />
              </div>
              <Show when={book().author_name}>
                <a
                  href={paths.authors(book().author_id)}
                  class="text-lg text-indigo-400 hover:text-indigo-300"
                >
                  {book().author_name}
                </a>
              </Show>

              <div class="mt-4 max-w-md">
                <InfoRow label="Publisher" value={book().publisher} />
                <InfoRow label="Published" value={book().publish_date} />
                <InfoRow label="Language" value={book().language} />
                <InfoRow label="Pages" value={book().pages} />
                <InfoRow label="ISBN" value={book().isbn ?? book().isbn13} />
                <InfoRow label="Rating" value={book().ratings?.toFixed(1)} />
              </div>

              <Show when={book().genres.length > 0}>
                <div class="mt-4 flex gap-2 flex-wrap">
                  <For each={book().genres}>
                    {(g) => (
                      <span class="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300">{g}</span>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={book().description}>
                <p class="mt-4 text-gray-300 leading-relaxed">{book().description}</p>
              </Show>
            </div>
          </div>
        </Loading>
      </Errored>
    </div>
  );
}
