import { Title } from "@solidjs/meta";
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { action, createMemo, createSignal, createStore, Errored, Loading, Show } from "solid-js";

import type { LibrarySettings } from "../../api/settings";

import * as settingsApi from "../../api/settings";

export const route = defineFileRoute("/settings/library", {
  info: { label: "Library" },
  preload: () => {
    void settingsApi.getLibrarySettings();
  },
});

const DEFAULTS: LibrarySettings = {
  root_folder: "",
  audiobook_folder: "",
  rename_files: false,
  author_folder_format: "{author_name}",
  book_file_format: "{book_title} ({author_name}).{ext}",
};

const PREVIEW_AUTHOR = "Asimov, Isaac";
const PREVIEW_TITLE = "Foundation";

function fillFormat(format: string): string {
  return format
    .replaceAll("{author_name}", PREVIEW_AUTHOR)
    .replaceAll("{book_id}", "1")
    .replaceAll("{book_title}", PREVIEW_TITLE)
    .replaceAll("{title}", PREVIEW_TITLE)
    .replaceAll("{quality}", "EPUB")
    .replaceAll("{format}", "EPUB")
    .replaceAll("{ext}", "epub");
}

export default function LibraryTab(_props: RouteProps<typeof route>) {
  const [form, setForm] = createStore<LibrarySettings>(
    async () => {
      const data = await settingsApi.getLibrarySettings();
      return { ...DEFAULTS, ...data.library };
    },
    { ...DEFAULTS },
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal(false);

  const preview = createMemo(() => {
    const root = form.root_folder.trim() || "/library/books";
    const folder = fillFormat(form.author_folder_format.trim() || "{author_name}");
    const file = fillFormat(form.book_file_format.trim() || "{book_title}.{ext}");
    return `${root.replace(/\/+$/, "")}/${folder}/${file}`;
  });

  const save = action(async function* () {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await settingsApi.updateLibrarySettings({
        root_folder: form.root_folder,
        audiobook_folder: form.audiobook_folder,
        rename_files: form.rename_files,
        author_folder_format: form.author_folder_format,
        book_file_format: form.book_file_format,
      });
      yield;
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  });

  return (
    <div>
      <Title>Library · Settings · ReadingRoom</Title>
      <h3 class="text-lg font-semibold mb-4">Library</h3>
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
          <div class="max-w-md p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Root folder (ebooks)</label>
              <input
                value={form.root_folder}
                onInput={(e) =>
                  setForm((st) => {
                    st.root_folder = e.currentTarget.value;
                  })
                }
                class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                placeholder="/data/books"
              />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Audiobook folder</label>
              <input
                value={form.audiobook_folder}
                onInput={(e) =>
                  setForm((st) => {
                    st.audiobook_folder = e.currentTarget.value;
                  })
                }
                class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                placeholder="/data/audiobooks"
              />
            </div>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.rename_files}
                onChange={(e) =>
                  setForm((st) => {
                    st.rename_files = e.currentTarget.checked;
                  })
                }
                class="rounded"
              />
              Rename imported files
            </label>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Author folder format</label>
              <input
                value={form.author_folder_format}
                onInput={(e) =>
                  setForm((st) => {
                    st.author_folder_format = e.currentTarget.value;
                  })
                }
                class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm font-mono"
                placeholder="{author_name}"
              />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Book file format</label>
              <input
                value={form.book_file_format}
                onInput={(e) =>
                  setForm((st) => {
                    st.book_file_format = e.currentTarget.value;
                  })
                }
                class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm font-mono"
                placeholder="{book_title} ({author_name}).{ext}"
              />
            </div>
            <div class="px-3 py-2 bg-gray-950 rounded border border-gray-800">
              <p class="text-xs text-gray-500 mb-1">Preview</p>
              <p class="text-xs text-gray-300 font-mono break-all">{preview()}</p>
            </div>
            <Show when={error()}>
              <p class="text-sm text-red-400">{error()}</p>
            </Show>
            <Show when={success()}>
              <p class="text-sm text-green-400">Library settings saved.</p>
            </Show>
            <button
              onClick={() => void save()}
              disabled={saving()}
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 rounded text-sm transition-colors"
            >
              {saving() ? "Saving..." : "Save"}
            </button>
          </div>
        </Loading>
      </Errored>
    </div>
  );
}
