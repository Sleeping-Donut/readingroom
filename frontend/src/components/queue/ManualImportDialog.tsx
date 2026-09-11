import { Dialog } from "@kobalte/core/dialog";
import { revalidate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { ImportCandidate, ImportMode } from "../../types";

import { getBooks } from "../../api/books";
import { getImportCandidates, getQueue, importQueueCandidates } from "../../api/queue";
import { createBooks } from "../../resources/books";

const formatSize = (bytes: number) => (bytes > 0 ? `${(bytes / 1_000_000).toFixed(1)} MB` : "—");

/// Resolve a completed download whose files could not be mapped automatically.
/// Each file is shown with its parsed title and a proposed book; the user
/// confirms or reassigns the target (or ignores the file) before importing.
export function ManualImportDialog(props: {
	queueId: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDone: () => void;
}) {
	const [candidates, setCandidates] = createSignal<ImportCandidate[] | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [mode, setMode] = createSignal<ImportMode>("copy");
	const [importing, setImporting] = createSignal(false);
	// path -> chosen target book id
	const [choices, setChoices] = createSignal<Record<string, number>>({});
	// path -> ignored
	const [ignored, setIgnored] = createSignal<Record<string, boolean>>({});

	const [books] = createBooks();
	const bookOptions = createMemo(() =>
		[...books.books].sort((a, b) => a.title.localeCompare(b.title)),
	);

	const load = async (queueId: number) => {
		setLoading(true);
		setError(null);
		setCandidates(null);
		try {
			const res = await getImportCandidates(queueId);
			setCandidates(res.candidates);
			const initial: Record<string, number> = {};
			for (const c of res.candidates) {
				if (c.book_id != null) initial[c.path] = c.book_id;
			}
			setChoices(initial);
			setIgnored({});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to scan download");
		} finally {
			setLoading(false);
		}
	};

	createEffect(
		() => ({ open: props.open, id: props.queueId }),
		({ open, id }) => {
			if (open) void load(id);
		},
	);

	const selected = createMemo(() =>
		(candidates() ?? []).filter((c) => !ignored()[c.path] && choices()[c.path] != null),
	);

	const runImport = async () => {
		setImporting(true);
		setError(null);
		try {
			const items = selected().map((c) => ({
				path: c.path,
				book_id: choices()[c.path],
			}));
			if (items.length === 0) {
				setError("Select at least one file to import.");
				return;
			}
			const res = await importQueueCandidates(props.queueId, items, mode());
			if (res.imported === 0) {
				setError(res.errors.join("; ") || "Import failed");
				return;
			}
			revalidate(getQueue.key);
			revalidate(getBooks.key);
			props.onDone();
			props.onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Import failed");
		} finally {
			setImporting(false);
		}
	};

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay class="fixed inset-0 z-40 bg-ink-900/40" />
				<Dialog.Content class="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(94vw,64rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-rule bg-paper-50 shadow-xl">
					<div class="flex flex-wrap items-center justify-between gap-3 border-b border-rule p-4">
						<div>
							<Dialog.Title class="text-xl font-bold">Manual Import</Dialog.Title>
							<Dialog.Description class="mt-0.5 text-xs text-ink-500">
								Map each file in this download to a book.
							</Dialog.Description>
						</div>
						<div class="flex flex-wrap items-center gap-2">
							<label class="flex items-center gap-1.5 text-xs text-ink-700">
								Mode
								<select
									value={mode()}
									onChange={(e) => setMode(e.currentTarget.value as ImportMode)}
									class="rounded-sm border border-rule bg-paper-100 px-2 py-1.5 text-xs text-ink-900"
								>
									<option value="copy">Copy (keep seeding)</option>
									<option value="hardlink">Hardlink</option>
									<option value="move">Move</option>
								</select>
							</label>
							<button
								onClick={() => void runImport()}
								disabled={importing() || selected().length === 0}
								class="rounded bg-ink-900 px-3 py-1.5 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
							>
								{importing() ? "Importing..." : `Import ${selected().length}`}
							</button>
							<Dialog.CloseButton class="rounded border border-rule px-3 py-1.5 text-sm text-ink-700 transition-colors hover:bg-paper-200">
								Close
							</Dialog.CloseButton>
						</div>
					</div>

					<div class="min-h-0 flex-1 overflow-y-auto p-4">
						<Show
							when={!loading()}
							fallback={<p class="text-sm text-ink-500">Scanning download...</p>}
						>
							<Show when={error()}>
								<p class="mb-3 text-sm text-bad">{error()}</p>
							</Show>
							<Show
								when={(candidates() ?? []).length > 0}
								fallback={
									<p class="text-sm text-ink-500">
										No compatible files found in this download.
									</p>
								}
							>
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead>
											<tr class="border-b border-rule text-left font-meta text-xs tracking-widest text-ink-500 uppercase">
												<th class="pr-4 pb-3">File</th>
												<th class="pr-4 pb-3">Format</th>
												<th class="pr-4 pb-3">Size</th>
												<th class="pr-4 pb-3">Target book</th>
												<th class="pr-4 pb-3">Ignore</th>
											</tr>
										</thead>
										<tbody>
											<For each={candidates() ?? []}>
												{(c) => (
													<tr class="border-b border-rule align-top hover:bg-paper-200">
														<td class="max-w-xs py-3 pr-4">
															<p
																class="truncate font-medium"
																title={c.path}
															>
																{c.name}
															</p>
															<p class="mt-0.5 truncate text-xs text-ink-500">
																{c.parsed_author
																	? `${c.parsed_author} · `
																	: ""}
																{c.parsed_title}
															</p>
															<Show when={c.rejection}>
																<p class="mt-1 text-xs text-bad">
																	{c.rejection}
																</p>
															</Show>
														</td>
														<td class="py-3 pr-4 whitespace-nowrap text-ink-700">
															{c.format} · {c.quality}
														</td>
														<td class="py-3 pr-4 whitespace-nowrap text-ink-700">
															{formatSize(c.size)}
														</td>
														<td class="py-3 pr-4">
															<select
																value={
																	choices()[c.path]?.toString() ??
																	""
																}
																aria-label={`Target book for ${c.name}`}
																onChange={(e) =>
																	setChoices((prev) => ({
																		...prev,
																		[c.path]: Number(
																			e.currentTarget.value,
																		),
																	}))
																}
																class="w-56 rounded-sm border border-rule bg-paper-100 px-2 py-1.5 text-xs text-ink-900"
															>
																<option value="">
																	— select book —
																</option>
																<For each={bookOptions()}>
																	{(b) => (
																		<option value={b.id}>
																			{b.title}
																		</option>
																	)}
																</For>
															</select>
														</td>
														<td class="py-3 pr-4">
															<input
																type="checkbox"
																checked={!!ignored()[c.path]}
																onChange={(e) =>
																	setIgnored((prev) => ({
																		...prev,
																		[c.path]:
																			e.currentTarget.checked,
																	}))
																}
																aria-label={`Ignore ${c.name}`}
															/>
														</td>
													</tr>
												)}
											</For>
										</tbody>
									</table>
								</div>
							</Show>
						</Show>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}

export default ManualImportDialog;
