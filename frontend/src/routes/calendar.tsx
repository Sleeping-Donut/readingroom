import { createMemo, Errored, For, Loading, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { api } from "../api/client";
import { paths } from "../router";
import type { Book } from "../types";

interface MonthGroup {
  year: number;
  month: number;
  books: Book[];
}

interface CalendarResponse {
  months: MonthGroup[];
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function Calendar() {
  const calendar = createMemo(async () => api.get<CalendarResponse>("/calendar"));

  return (
    <div>
      <Title>Release Calendar · ReadingRoom</Title>
      <h2 class="text-2xl font-bold mb-6">Release Calendar</h2>

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
          <div>
            <Show
              when={calendar().months.length > 0}
              fallback={
                <div class="text-center py-12 text-gray-500">
                  <p class="text-lg">No upcoming releases</p>
                  <p class="text-sm mt-2">Books with publish dates will appear here.</p>
                </div>
              }
            >
              <For each={calendar().months}>
                {(monthGroup) => (
                  <div class="mb-8">
                    <h3 class="text-xl font-semibold text-indigo-300 mb-4">
                      {monthNames[monthGroup.month - 1]} {monthGroup.year}
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <For each={monthGroup.books}>
                        {(book) => (
                          <a
                            href={String(paths.books(book.id))}
                            class="block p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-indigo-600 transition-colors"
                          >
                            <Show when={book.image_url}>
                              {(img) => (
                                <img
                                  src={img()}
                                  alt={book.title}
                                  class="w-full h-48 object-cover rounded mb-3"
                                />
                              )}
                            </Show>
                            <p class="font-medium truncate">{book.title}</p>
                            <p class="text-xs text-gray-400 mt-1">{book.publish_date}</p>
                          </a>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Loading>
      </Errored>
    </div>
  );
}
