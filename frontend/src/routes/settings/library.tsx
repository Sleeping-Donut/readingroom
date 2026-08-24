import { Title } from "@solidjs/meta";
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
	action,
	createMemo,
	createOptimistic,
	createSignal,
	createStore,
	Errored,
	Loading,
	Show,
} from "solid-js";

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
	const [saving, setSaving] = createOptimistic(false);
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
		}
	});

	return (
		<div>
			<Title>Library · Settings · ReadingRoom</Title>
			<h3 class="mb-4 font-display text-2xl text-ink-900">Library</h3>
			<Errored
				fallback={(err, reset) => (
					<p class="mt-2 text-sm text-bad">
						Failed to load: {String(err())}{" "}
						<button onClick={reset} class="ml-1 text-accent underline">
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-ink-500">Loading...</p>}>
					<div class="max-w-md space-y-3 rounded-lg border border-rule bg-paper-100 p-4">
						<div>
							<label
								for="library-root-folder"
								class="mb-1 block text-xs text-ink-700"
							>
								Root folder (ebooks)
							</label>
							<input
								id="library-root-folder"
								value={form.root_folder}
								onInput={(e) =>
									setForm((st) => {
										st.root_folder = e.currentTarget.value;
									})
								}
								class="w-full rounded border border-rule bg-paper-200 px-3 py-2 text-sm"
								placeholder="/data/books"
							/>
						</div>
						<div>
							<label
								for="library-audiobook-folder"
								class="mb-1 block text-xs text-ink-700"
							>
								Audiobook folder
							</label>
							<input
								id="library-audiobook-folder"
								value={form.audiobook_folder}
								onInput={(e) =>
									setForm((st) => {
										st.audiobook_folder = e.currentTarget.value;
									})
								}
								class="w-full rounded border border-rule bg-paper-200 px-3 py-2 text-sm"
								placeholder="/data/audiobooks"
							/>
						</div>
						<label class="flex cursor-pointer items-center gap-2 text-sm">
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
							<label
								for="library-author-format"
								class="mb-1 block text-xs text-ink-700"
							>
								Author folder format
							</label>
							<input
								id="library-author-format"
								value={form.author_folder_format}
								onInput={(e) =>
									setForm((st) => {
										st.author_folder_format = e.currentTarget.value;
									})
								}
								class="w-full rounded border border-rule bg-paper-200 px-3 py-2 font-mono text-sm"
								placeholder="{author_name}"
							/>
						</div>
						<div>
							<label
								for="library-book-format"
								class="mb-1 block text-xs text-ink-700"
							>
								Book file format
							</label>
							<input
								id="library-book-format"
								value={form.book_file_format}
								onInput={(e) =>
									setForm((st) => {
										st.book_file_format = e.currentTarget.value;
									})
								}
								class="w-full rounded border border-rule bg-paper-200 px-3 py-2 font-mono text-sm"
								placeholder="{book_title} ({author_name}).{ext}"
							/>
						</div>
						<div class="rounded border border-rule bg-paper-50 px-3 py-2">
							<p class="mb-1 text-xs text-ink-500">Preview</p>
							<p class="font-mono text-xs break-all text-ink-900">{preview()}</p>
						</div>
						<Show when={error()}>
							<p class="text-sm text-bad">{error()}</p>
						</Show>
						<Show when={success()}>
							<p class="text-sm text-good">Library settings saved.</p>
						</Show>
						<button
							onClick={() => void save()}
							disabled={saving()}
							class="rounded bg-ink-900 px-4 py-2 text-sm text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
						>
							{saving() ? "Saving..." : "Save"}
						</button>
					</div>
				</Loading>
			</Errored>
		</div>
	);
}
