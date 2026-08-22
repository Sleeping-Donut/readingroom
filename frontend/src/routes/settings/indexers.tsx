import { Title } from "@solidjs/meta";
import { useBeforeLeave, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
	Errored,
	For,
	Loading,
	Show,
	createEffect,
	createMemo,
	createOptimistic,
	createSignal,
	createStore,
} from "solid-js";

import type { ImplementationInfo } from "../../api/settings";
import type { Draft } from "../../resources/indexers";

import * as settingsApi from "../../api/settings";
import { ImplementationPicker } from "../../components/settings/ImplementationPicker";
import { IndexerCard } from "../../components/settings/IndexerCard";
import { IndexerConfigFields } from "../../components/settings/IndexerConfigFields";
import { IndexerEditPanel } from "../../components/settings/IndexerEditPanel";
import {
	CORE_IMPLEMENTATIONS,
	createIndexers,
	draftFor,
	toInput,
	validateDraft,
} from "../../resources/indexers";

export const route = defineFileRoute("/settings/indexers", {
	info: { label: "Indexers" },
	preload: () => {
		void settingsApi.listIndexers();
		void settingsApi.getIndexerImplementations();
	},
});

export default function IndexersTab(_props: RouteProps<typeof route>) {
	const [
		indexers,
		{
			addIndexer,
			updateIndexer,
			removeIndexer,
			retryRemoveIndexer,
			testIndexer,
			testAllIndexers,
		},
	] = createIndexers();

	// Implementation catalog for the add wizard. Falls back to the static core
	// list while loading or if the endpoint is unreachable.
	const implementations = createMemo(() => settingsApi.getIndexerImplementations());

	const implementationList = createMemo<ImplementationInfo[]>(
		() => implementations()?.implementations ?? CORE_IMPLEMENTATIONS,
	);

	const implById = (id: string) => implementationList().find((i) => i.id === id) ?? null;

	// Add wizard: "closed" -> "pick" -> "configure".
	const [addStep, setAddStep] = createSignal<"closed" | "pick" | "configure">("closed");
	const [configureImplId, setConfigureImplId] = createSignal<string | null>(null);
	const configureImpl = createMemo(() =>
		configureImplId() ? implById(configureImplId()!) : null,
	);

	// Edit-in-place.
	const [editing, setEditing] = createSignal<{ id: number; implId: string } | null>(null);
	const editingImpl = createMemo(() => (editing() ? implById(editing()!.implId) : null));

	// One draft store serves both flows; reseeded when a flow opens.
	const [draft, setDraft] = createStore<Draft>({
		name: "",
		values: {},
		enable_rss: true,
		enable_search: true,
		priority: 0,
	});
	const [submitting, setSubmitting] = createSignal(false);
	const [isTestingAll, setIsTestingAll] = createOptimistic(false);
	const [actionError, setActionError] = createSignal<string | null>(null);

	const runTestAll = async () => {
		setIsTestingAll(true);
		try {
			await testAllIndexers();
		} finally {
			setIsTestingAll(false);
		}
	};

	useBeforeLeave((event) => {
		if (!editing()) return;
		event.preventDefault();
		if (window.confirm("Discard unsaved changes?")) event.retry(true);
	});

	// Auto-test each indexer once after the first load (imperative boundary).
	const [autoTested, setAutoTested] = createSignal(false);
	createEffect(
		() => indexers.indexers,
		(list) => {
			if (autoTested() || list.length === 0) return;
			setAutoTested(true);
			const timers = list.map((idx, i) =>
				setTimeout(() => void testIndexer(idx.id), i * 300),
			);
			return () => timers.forEach(clearTimeout);
		},
	);

	const addValid = createMemo(() => {
		const impl = configureImpl();
		if (!impl) return false;
		return validateDraft(impl, draft).success;
	});

	const editValid = createMemo(() => {
		const impl = editingImpl();
		if (!editing() || !impl) return false;
		return validateDraft(impl, draft).success;
	});

	const submitAdd = async () => {
		const impl = configureImpl();
		if (!impl) return;
		const parsed = validateDraft(impl, draft);
		if (!parsed.success) {
			setActionError(parsed.error ?? "Invalid indexer settings");
			return;
		}
		setSubmitting(true);
		setActionError(null);
		try {
			await addIndexer(toInput(impl, { ...draft, name: parsed.output.name }));
			setAddStep("closed");
			setDraft(() => draftFor(impl));
		} catch (e) {
			setActionError(e instanceof Error ? e.message : "Request failed");
		} finally {
			setSubmitting(false);
		}
	};

	const submitEdit = async () => {
		const editingState = editing();
		const impl = editingImpl();
		if (!editingState || !impl) return;
		const parsed = validateDraft(impl, draft);
		if (!parsed.success) {
			setActionError(parsed.error ?? "Invalid indexer settings");
			return;
		}
		setSubmitting(true);
		setActionError(null);
		try {
			await updateIndexer(
				editingState.id,
				toInput(impl, { ...draft, name: parsed.output.name }),
			);
			setEditing(null);
		} catch (e) {
			setActionError(e instanceof Error ? e.message : "Request failed");
		} finally {
			setSubmitting(false);
		}
	};

	const startEdit = (idx: (typeof indexers.indexers)[number]) => {
		const impl = implById(idx.implementation);
		if (!impl) return;
		setEditing({ id: idx.id, implId: impl.id });
		setDraft(() => draftFor(impl, idx));
	};

	return (
		<div>
			<Title>Indexers · Settings · ReadingRoom</Title>
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
					<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
						<h3 class="font-display text-2xl text-ink-900">Indexers</h3>
						<div class="flex gap-2">
							<Show when={indexers.indexers.length > 0}>
								<button
									onClick={() => void runTestAll()}
									disabled={isTestingAll()}
									class="rounded bg-ink-900 px-3 py-1.5 text-sm transition-colors hover:bg-ink-900 disabled:opacity-50"
								>
									{isTestingAll() ? "Testing All..." : "Test All"}
								</button>
							</Show>
							<button
								onClick={() =>
									setAddStep(addStep() === "closed" ? "pick" : "closed")
								}
								class="rounded bg-ink-900 px-3 py-1.5 text-sm transition-colors hover:bg-ink-700"
							>
								{addStep() !== "closed" ? "Cancel" : "Add Indexer"}
							</button>
						</div>
					</div>

					<Show when={actionError()}>
						<p class="mt-2 text-sm text-bad">{actionError()}</p>
					</Show>

					<Show when={addStep() !== "closed"}>
						<div class="mb-4 rounded-lg border border-rule bg-paper-100 p-4">
							<Show
								when={addStep() === "configure"}
								fallback={
									<ImplementationPicker
										implementations={implementationList()}
										onPick={(impl) => {
											setConfigureImplId(impl.id);
											setDraft(() => draftFor(impl));
											setAddStep("configure");
										}}
									/>
								}
							>
								<IndexerConfigFields
									impl={configureImpl()!}
									draft={draft}
									setDraft={setDraft}
									showPriority={false}
								/>
								<div class="mt-4 flex items-center gap-3">
									<button
										onClick={() => setAddStep("pick")}
										class="rounded bg-paper-200 px-4 py-2 text-sm transition-colors hover:bg-paper-200"
									>
										Back
									</button>
									<button
										onClick={() => void submitAdd()}
										disabled={submitting() || !addValid()}
										class="rounded bg-good px-4 py-2 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
									>
										Save
									</button>
									<button
										onClick={() => setAddStep("closed")}
										class="rounded bg-paper-200 px-4 py-2 text-sm transition-colors hover:bg-paper-200"
									>
										Cancel
									</button>
								</div>
							</Show>
						</div>
					</Show>

					<Show
						when={indexers.indexers.length > 0}
						fallback={<p class="text-sm text-ink-500">No indexers configured.</p>}
					>
						<div class="space-y-2">
							<For each={indexers.indexers}>
								{(idx) => (
									<Show
										when={editing()?.id === idx.id}
										fallback={
											<IndexerCard
												idx={idx}
												implLabel={
													implById(idx.implementation)?.label ??
													idx.implementation
												}
												onTest={() => void testIndexer(idx.id)}
												onEdit={() => startEdit(idx)}
												onRemove={() => void removeIndexer(idx)}
												onRetry={() => void retryRemoveIndexer(idx)}
											/>
										}
									>
										<IndexerEditPanel
											impl={editingImpl()!}
											draft={draft}
											setDraft={setDraft}
											showPriority
											submitting={submitting()}
											valid={editValid()}
											onCancel={() => setEditing(null)}
											onSave={() => void submitEdit()}
										/>
									</Show>
								)}
							</For>
						</div>
					</Show>
				</Loading>
			</Errored>
		</div>
	);
}
