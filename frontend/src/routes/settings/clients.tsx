import { Title } from "@solidjs/meta";
import { useBeforeLeave, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
	createEffect,
	createMemo,
	createOptimistic,
	createSignal,
	createStore,
	Errored,
	For,
	Loading,
	Show,
	action,
} from "solid-js";

import type { TestResult } from "../../types";

import * as settingsApi from "../../api/settings";
import { AddClientForm } from "../../components/settings/clients/AddClientForm";
import { BuiltinClientPanel } from "../../components/settings/clients/BuiltinClientPanel";
import { ClientCard } from "../../components/settings/clients/ClientCard";
import { ClientEditPanel } from "../../components/settings/clients/ClientEditPanel";
import {
	builtinFormFor,
	builtinInput,
	createDownloadClients,
	draftFor,
	isBuiltinClient,
	toInput,
	validateDraft,
	type ClientRow,
	type Draft,
} from "../../resources/clients";

export const route = defineFileRoute("/settings/clients", {
	info: { label: "Download Clients" },
	preload: () => {
		void settingsApi.listDownloadClients();
	},
});

export default function DownloadClientsTab(_props: RouteProps<typeof route>) {
	const [
		clients,
		{
			addClient,
			updateClient,
			removeClient,
			retryRemoveClient,
			setClientEnabled,
			upsertBuiltin,
			setBuiltinEnabled,
			testClient,
			testBuiltin,
			testAllClients,
		},
	] = createDownloadClients();

	const builtinRow = createMemo(() => clients.download_clients.find((c) => isBuiltinClient(c)));
	const configurableClients = createMemo(() =>
		clients.download_clients.filter((c) => !isBuiltinClient(c)),
	);

	// Built-in HTTP downloader form, seeded once from its current row.
	const [builtinForm, setBuiltinForm] = createStore(() => builtinFormFor(builtinRow()), {
		download_dir: "./downloads",
		rate_limit_kb: "",
		concurrent: "2",
		enabled: true,
	});
	const [builtinTestResult, setBuiltinTestResult] = createSignal<TestResult | undefined>(
		undefined,
	);
	const [savingBuiltin, setSavingBuiltin] = createOptimistic(false);

	// Add flow.
	const [showAdd, setShowAdd] = createSignal(false);
	// Edit-in-place.
	const [editingClientId, setEditingClientId] = createSignal<number | null>(null);

	// One draft store serves both flows; reseeded when a flow opens.
	const [draft, setDraft] = createStore<Draft>(draftFor());
	const [submitting, setSubmitting] = createOptimistic(false);
	// Optimistic: reverts to false automatically when the action settles.
	const [isTestingAll, setIsTestingAll] = createOptimistic(false);
	const [actionError, setActionError] = createSignal<string | null>(null);

	useBeforeLeave((event) => {
		if (!editingClientId()) return;
		event.preventDefault();
		if (window.confirm("Discard unsaved changes?")) event.retry(true);
	});

	// Auto-test each configurable client once after the first load.
	const [autoTested, setAutoTested] = createSignal(false);
	createEffect(
		() => configurableClients(),
		(list) => {
			if (autoTested() || list.length === 0) return;
			setAutoTested(true);
			const timers = list.map((cl, i) => setTimeout(() => void testClient(cl.id), i * 300));
			return () => timers.forEach(clearTimeout);
		},
	);

	const addValid = createMemo(() => validateDraft(draft).success);

	// The edit flow historically only requires a name.
	const editValid = createMemo(() => draft.name.trim().length > 0);

	const runTestAll = action(async function* () {
		setIsTestingAll(true);
		yield testAllClients();
	});

	const submitAdd = action(async function* () {
		const parsed = validateDraft(draft);
		if (!parsed.success) {
			setActionError(parsed.error);
			return;
		}
		setSubmitting(true);
		setActionError(null);
		try {
			yield addClient(toInput(draft));
			setShowAdd(false);
			setDraft(() => draftFor());
		} catch (e) {
			setActionError(e instanceof Error ? e.message : "Request failed");
		}
	});

	const submitEdit = action(async function* () {
		const id = editingClientId();
		if (!id) return;
		setSubmitting(true);
		setActionError(null);
		try {
			yield updateClient(id, toInput(draft));
			setEditingClientId(null);
		} catch (e) {
			setActionError(e instanceof Error ? e.message : "Request failed");
		}
	});

	const toggleEnabled = async (row: ClientRow, enabled: boolean) => {
		setActionError(null);
		try {
			await setClientEnabled(row.id, enabled);
		} catch (e) {
			setActionError(e instanceof Error ? e.message : "Request failed");
		}
	};

	const toggleBuiltinEnabled = async (enabled: boolean) => {
		setActionError(null);
		setBuiltinForm((f) => {
			f.enabled = enabled;
		});
		try {
			await setBuiltinEnabled(builtinRow(), enabled, builtinInput(builtinForm));
		} catch (e) {
			setBuiltinForm((f) => {
				f.enabled = !enabled;
			});
			setActionError(e instanceof Error ? e.message : "Request failed");
		}
	};

	const saveBuiltin = action(async function* () {
		setSavingBuiltin(true);
		setActionError(null);
		try {
			yield upsertBuiltin(builtinInput(builtinForm));
		} catch (e) {
			setActionError(e instanceof Error ? e.message : "Request failed");
		}
	});

	const runTestBuiltin = async () => {
		setBuiltinTestResult({ status: "testing" });
		setBuiltinTestResult(await testBuiltin(builtinInput(builtinForm)));
	};

	const startEdit = (client: ClientRow) => {
		setEditingClientId(client.id);
		setDraft(() => draftFor(client));
	};

	return (
		<div>
			<Title>Download Clients · Settings · ReadingRoom</Title>
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
						<h3 class="font-display text-2xl text-ink-900">Download Clients</h3>
						<div class="flex gap-2">
							<Show when={configurableClients().length > 0}>
								<button
									onClick={() => void runTestAll()}
									disabled={isTestingAll()}
									class="rounded bg-ink-900 px-3 py-1.5 text-sm text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
								>
									{isTestingAll() ? "Testing All..." : "Test All"}
								</button>
							</Show>
							<button
								onClick={() => setShowAdd(!showAdd())}
								class="rounded bg-ink-900 px-3 py-1.5 text-sm text-paper-50 transition-colors hover:bg-ink-700"
							>
								{showAdd() ? "Cancel" : "Add Client"}
							</button>
						</div>
					</div>

					<Show when={actionError()}>
						<p class="mt-2 text-sm text-bad">{actionError()}</p>
					</Show>

					<BuiltinClientPanel
						form={builtinForm}
						setForm={setBuiltinForm}
						result={builtinTestResult()}
						saving={savingBuiltin()}
						onToggleEnabled={(enabled) => void toggleBuiltinEnabled(enabled)}
						onSave={() => void saveBuiltin()}
						onTest={() => void runTestBuiltin()}
					/>

					<Show when={showAdd()}>
						<AddClientForm
							draft={draft}
							setDraft={setDraft}
							submitting={submitting()}
							valid={addValid()}
							onSave={() => void submitAdd()}
							onCancel={() => setShowAdd(false)}
						/>
					</Show>

					<Show
						when={configurableClients().length > 0}
						fallback={
							<p class="text-sm text-ink-500">No download clients configured.</p>
						}
					>
						<div class="space-y-2">
							<For each={configurableClients()}>
								{(client) => (
									<Show
										when={editingClientId() === client.id}
										fallback={
											<ClientCard
												client={client}
												onToggleEnabled={(enabled) =>
													void toggleEnabled(client, enabled)
												}
												onEdit={() => startEdit(client)}
												onTest={() => void testClient(client.id)}
												onRemove={() => void removeClient(client)}
												onRetry={() => void retryRemoveClient(client.id)}
											/>
										}
									>
										<ClientEditPanel
											draft={draft}
											setDraft={setDraft}
											submitting={submitting()}
											valid={editValid()}
											onCancel={() => setEditingClientId(null)}
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
