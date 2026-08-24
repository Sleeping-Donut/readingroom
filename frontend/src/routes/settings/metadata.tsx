import { makeTimer } from "@solid-primitives/timer";
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
	action,
	createMemo,
	createOptimistic,
	createSignal,
	Errored,
	Loading,
	onSettled,
	Show,
} from "solid-js";

import type { CacheMeta, ImportCounts, MetadataStatus } from "../../api/settings";

import { uploadWithProgress } from "../../api/client";
import * as settingsApi from "../../api/settings";

export const route = defineFileRoute("/settings/metadata", {
	info: { label: "Metadata" },
	preload: () => {
		void settingsApi.getMetadataSettings();
	},
});

function fmtBytes(bytes: number): string {
	if (!bytes) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let i = 0;
	let n = bytes;
	while (n >= 1024 && i < units.length - 1) {
		n /= 1024;
		i++;
	}
	return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(iso: string | null): string {
	if (!iso) return "never";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString();
}

function StatusCard(props: {
	status: MetadataStatus;
	meta: CacheMeta | null;
	counts: ImportCounts | null;
	ready: boolean;
}) {
	const state = () => props.status.state;
	const running = () => state() === "Downloading" || state() === "Importing";
	const liveFailed = () => state().startsWith("Failed");
	const persistedFailed = () =>
		!running() && !liveFailed() && props.meta?.last_status === "failed";
	const hasData = () => (props.counts?.works ?? 0) + (props.counts?.editions ?? 0) > 0;

	const phaseBytes = () =>
		state() === "Importing" ? props.status.import_bytes : props.status.bytes_downloaded;
	const pct = () => {
		const total = props.status.total_bytes ?? 0;
		if (total <= 0) return 0;
		return Math.min(100, Math.round((phaseBytes() / total) * 100));
	};
	const failed = () => liveFailed() || persistedFailed();

	const label = () => {
		if (failed()) return "Failed";
		if (state() === "Downloading") return "Fetching dump";
		if (state() === "Importing") return "Importing dump";
		if (state() === "Done" || hasData()) return "Ready";
		return "Not downloaded yet";
	};

	const badgeClass = () => {
		if (failed()) return "bg-bad/10 text-bad border border-bad/30";
		if (running()) return "bg-accent-wash text-accent border border-accent/30";
		if (state() === "Done" || hasData()) return "bg-good/10 text-good border border-good/30";
		return "bg-paper-200 text-ink-700 border border-rule";
	};

	const errorMessage = () =>
		liveFailed() ? state() : (props.meta?.last_error ?? "Import failed");

	return (
		<div class="rounded-lg border border-rule bg-paper-100 p-4">
			<div class="mb-3 flex items-center justify-between">
				<h4 class="font-semibold text-ink-900">Local dump cache</h4>
				<span class={["rounded px-2 py-1 text-xs font-medium", badgeClass()]}>
					{label()}
				</span>
			</div>

			<Show when={failed()}>
				<p class="mb-2 text-sm break-all text-bad">{errorMessage()}</p>
				<Show when={persistedFailed() && props.meta?.last_attempt}>
					<p class="mb-2 text-xs text-ink-500">
						Last attempt: {fmtDate(props.meta?.last_attempt ?? null)}
					</p>
				</Show>
			</Show>

			<Show when={running()}>
				<div class="mb-3">
					<div class="mb-1 flex justify-between text-xs text-ink-700">
						<span>
							{fmtBytes(phaseBytes())}
							{props.status.total_bytes
								? ` / ${fmtBytes(props.status.total_bytes)} (${pct()}%)`
								: ""}
						</span>
						<Show when={state() === "Importing"}>
							<span>{props.status.rows.toLocaleString()} rows</span>
						</Show>
					</div>
					<div class="h-2 w-full rounded bg-paper-200">
						<div
							class="h-2 rounded bg-accent transition-all"
							style={{ width: `${pct()}%` }}
						/>
					</div>
				</div>
			</Show>

			<dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
				<div>
					<dt class="text-xs text-ink-500">Works</dt>
					<dd class="font-medium">{(props.counts?.works ?? 0).toLocaleString()}</dd>
				</div>
				<div>
					<dt class="text-xs text-ink-500">Editions</dt>
					<dd class="font-medium">{(props.counts?.editions ?? 0).toLocaleString()}</dd>
				</div>
				<div>
					<dt class="text-xs text-ink-500">Authors</dt>
					<dd class="font-medium">{(props.counts?.authors ?? 0).toLocaleString()}</dd>
				</div>
				<div>
					<dt class="text-xs text-ink-500">Redirects</dt>
					<dd class="font-medium">{(props.counts?.redirects ?? 0).toLocaleString()}</dd>
				</div>
			</dl>

			<div class="mt-3 text-xs text-ink-500">
				Dump imported: {fmtDate(props.meta?.imported_at ?? null)}
				{props.ready && !running() ? " · Offline lookups available" : ""}
			</div>
		</div>
	);
}

export default function MetadataTab(_props: RouteProps<typeof route>) {
	// Settings + status are a single derived async value. A tick signal re-reads
	// the source when a download/import is in flight (see onSettled below).
	const [tick, setTick] = createSignal(0);
	const data = createMemo(async () => {
		tick();
		return settingsApi.getMetadataSettings();
	});
	const running = createMemo(() => {
		const s = data().status.state;
		return s === "Downloading" || s === "Importing";
	});
	// Local edit override for the dump URL; null means "mirror the server value".
	const [dumpUrlOverride, setDumpUrl] = createSignal<string | null>(null);
	const dumpUrl = () => dumpUrlOverride() ?? data().dump_url;
	const [saving, setSaving] = createOptimistic(false);
	const [error, setError] = createSignal<string | null>(null);
	const [notice, setNotice] = createSignal<string | null>(null);

	onSettled(() => {
		makeTimer(
			() => {
				if (running()) setTick((t) => t + 1);
			},
			5000,
			setInterval,
		);
	});

	const refresh = () => setTick((t) => t + 1);

	const save = action(async function* (body: {
		mode?: "online" | "offline";
		auto_update?: boolean;
		dump_url?: string;
	}) {
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			yield settingsApi.updateMetadataSettings(body);
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Request failed");
		}
	});

	const runDownload = async () => {
		setError(null);
		setNotice(null);
		try {
			const res = await settingsApi.triggerMetadataDownload();
			if (!res.started) setError("A download/import is already running.");
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Request failed");
		}
	};

	const runCheck = async () => {
		setError(null);
		setNotice(null);
		try {
			const res = await settingsApi.checkMetadataUpdates();
			refresh();
			if (res.check.newer) {
				if (!res.check.started)
					setError("A newer dump exists but a download is already running.");
			} else {
				setNotice("Cache is up to date.");
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Request failed");
		}
	};

	const [file, setFile] = createSignal<File | null>(null);
	const [uploading, setUploading] = createOptimistic(false);
	const [uploadProgress, setUploadProgress] = createSignal(0);

	const runUpload = action(async function* () {
		const f = file();
		if (!f) return;
		setUploading(true);
		setError(null);
		setNotice(null);
		try {
			const res = yield uploadWithProgress<{ success: boolean; started: boolean }>(
				"/settings/metadata/upload",
				f,
				setUploadProgress,
			);
			setFile(null);
			refresh();
			if (res?.started) setNotice("Dump uploaded — importing in the background.");
			else setError("A download/import is already running.");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Upload failed");
		}
	});

	return (
		<div class="space-y-6">
			<Errored
				fallback={(err, reset) => (
					<p class="text-sm text-bad">
						Failed to load: {String(err())}{" "}
						<button onClick={reset} class="ml-1 text-accent underline">
							Retry
						</button>
					</p>
				)}
			>
				<Loading fallback={<p class="text-ink-500">Loading...</p>}>
					<div class="rounded-lg border border-rule bg-paper-100 p-4">
						<h4 class="mb-1 font-semibold text-ink-900">Metadata source</h4>
						<p class="mb-4 text-sm text-ink-500">
							Use the OpenLibrary website API, or a local offline cache built from the
							full <code class="text-ink-700">ol_dump_all_latest.txt.gz</code> dump
							(~12 GB compressed). Enabling the local cache downloads and imports the
							dump in the background.
						</p>

						<div class="flex flex-col gap-6 sm:flex-row">
							<label class="flex items-center gap-3">
								<input
									type="checkbox"
									checked={data().mode === "offline"}
									onChange={(e) =>
										void save({
											mode: e.currentTarget.checked ? "offline" : "online",
										})
									}
									disabled={saving()}
									class="h-4 w-4 rounded"
								/>
								<span class="text-sm">
									Local cache (offline) metadata source
									<span class="block text-xs text-ink-500">
										{data().mode === "offline"
											? "Disabled the online API; uses the dump cache."
											: "Uses the online OpenLibrary API."}
									</span>
								</span>
							</label>

							<label class="flex items-center gap-3">
								<input
									type="checkbox"
									checked={data().auto_update}
									onChange={(e) =>
										void save({ auto_update: e.currentTarget.checked })
									}
									disabled={saving()}
									class="h-4 w-4 rounded"
								/>
								<span class="text-sm">
									Check periodically for a newer dump
									<span class="block text-xs text-ink-500">
										Re-imports automatically when a new dump is published.
									</span>
								</span>
							</label>
						</div>

						<div class="mt-4">
							<label for="metadata-dump-url" class="mb-1 block text-sm text-ink-700">
								Dump URL
							</label>
							<div class="flex flex-col gap-2 sm:flex-row">
								<input
									id="metadata-dump-url"
									name="dump_url"
									type="text"
									value={dumpUrl()}
									onInput={(e) => setDumpUrl(e.currentTarget.value)}
									class="flex-1 rounded border border-rule bg-paper-200 px-3 py-1.5 text-sm text-ink-900 focus:border-ink-900 focus:outline-hidden"
								/>
								<button
									onClick={() => void save({ dump_url: dumpUrl() })}
									disabled={saving() || dumpUrl() === data().dump_url}
									class="rounded bg-ink-900 px-4 py-1.5 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:bg-paper-200"
								>
									Save
								</button>
							</div>
						</div>
					</div>

					<StatusCard
						status={data().status}
						meta={data().stats?.meta ?? null}
						counts={data().stats?.counts ?? null}
						ready={data().offline_ready}
					/>

					<Show when={error()}>
						<p class="text-sm text-bad">{error()}</p>
					</Show>
					<Show when={notice()}>
						<p class="text-sm text-ink-700">{notice()}</p>
					</Show>

					<div class="flex gap-3">
						<button
							onClick={() => void runDownload()}
							disabled={saving()}
							class="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:bg-paper-200"
						>
							Download / Re-import now
						</button>
						<button
							onClick={() => void runCheck()}
							disabled={saving()}
							class="rounded-lg bg-paper-200 px-4 py-2 text-sm font-medium transition-colors hover:bg-paper-200 disabled:bg-paper-200"
						>
							Check for updates
						</button>
					</div>

					<div class="rounded-lg border border-rule bg-paper-100 p-4">
						<h4 class="mb-1 font-semibold text-ink-900">Upload dump file</h4>
						<p class="mb-3 text-sm text-ink-500">
							Download the dump yourself (e.g.{" "}
							<code class="text-ink-700">ol_dump_latest.txt.gz</code>) and upload it
							here to build the local cache. Import runs in the background.
						</p>
						<div class="flex flex-col gap-2 sm:flex-row">
							<input
								type="file"
								accept=".gz,application/gzip"
								onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
								class="flex-1 text-sm text-ink-900 file:mr-3 file:rounded file:border file:border-rule file:bg-paper-200 file:px-3 file:py-1.5 file:text-ink-900"
							/>
							<button
								onClick={() => void runUpload()}
								disabled={uploading() || !file()}
								class="rounded-lg bg-good px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:opacity-90 disabled:bg-paper-200"
							>
								{uploading()
									? `Uploading ${uploadProgress().toFixed(0)}%`
									: "Upload & Import"}
							</button>
						</div>
					</div>
				</Loading>
			</Errored>
		</div>
	);
}
