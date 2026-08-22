import { action, createOptimisticStore, createStore, createProjection, refresh } from "solid-js";
import * as v from "valibot";

import type { DownloadClientInput } from "../api/settings";
import type { TestResult } from "../types";

import * as settingsApi from "../api/settings";
import { buildClientSettings } from "../api/settings";

type ServerClient = Awaited<
	ReturnType<typeof settingsApi.listDownloadClients>
>["download_clients"][number];

export type RowError = { op: "add" | "update" | "remove" | "toggle"; args: unknown[] };

// Wire row minus server-only metadata the optimistic temp row can't provide,
// plus the optimistic in-flight flag (written during actions, reverted on settle).
type StoredClient = Omit<ServerClient, "tags" | "created_at"> & {
	pending?: boolean;
};

// Projected row: stored fields + client affordances layered by the projection.
export type ClientRow = StoredClient & {
	error?: RowError;
	test?: TestResult;
};

// --- settings parsing ---------------------------------------------------------

export interface ClientSettings {
	host: string;
	port: number;
	username: string;
	password: string;
	url_base: string;
	category: string;
	download_dir: string;
	rate_limit?: number;
	concurrent_downloads?: number;
}

const CLIENT_SETTINGS_SCHEMA = v.object({
	host: v.optional(v.string()),
	port: v.optional(v.number()),
	username: v.optional(v.string()),
	password: v.optional(v.string()),
	url_base: v.optional(v.string()),
	category: v.optional(v.string()),
	download_dir: v.optional(v.string()),
	rate_limit: v.optional(v.number()),
	concurrent_downloads: v.optional(v.number()),
});

/// Parse a row's stored settings JSON into a typed shape, falling back to
/// blank/zero values when absent or malformed.
export function parseClientSettings(settings: string): ClientSettings {
	const parsed = v.safeParse(
		CLIENT_SETTINGS_SCHEMA,
		(() => {
			try {
				return JSON.parse(settings);
			} catch {
				return null;
			}
		})(),
	);
	if (!parsed.success) {
		return {
			host: "",
			port: 0,
			username: "",
			password: "",
			url_base: "",
			category: "",
			download_dir: "",
			rate_limit: undefined,
			concurrent_downloads: undefined,
		};
	}
	return {
		host: parsed.output.host ?? "",
		port: parsed.output.port ?? 0,
		username: parsed.output.username ?? "",
		password: parsed.output.password ?? "",
		url_base: parsed.output.url_base ?? "",
		category: parsed.output.category ?? "",
		download_dir: parsed.output.download_dir ?? "",
		rate_limit: parsed.output.rate_limit,
		concurrent_downloads: parsed.output.concurrent_downloads,
	};
}

export function isBuiltinClient(client: Pick<ServerClient, "name" | "implementation">): boolean {
	return client.implementation === "http" && client.name === "HTTP Direct";
}

// --- drafts -----------------------------------------------------------------

export interface Draft {
	name: string;
	implementation: string;
	host: string;
	port: number;
	username: string;
	password: string;
	url_base: string;
	category: string;
	download_dir: string;
	rate_limit_kb: string;
	concurrent_downloads: string;
}

export interface BuiltinForm {
	download_dir: string;
	rate_limit_kb: string;
	concurrent: string;
	enabled: boolean;
}

/// Seed an editable draft, optionally pre-filling from a row's stored settings.
export function draftFor(client?: ClientRow): Draft {
	const s = client ? parseClientSettings(client.settings) : null;
	return {
		name: client?.name ?? "",
		implementation: client?.implementation ?? "transmission",
		host: s?.host ?? "",
		port: s?.port ?? 0,
		username: s?.username ?? "",
		password: s?.password ?? "",
		url_base: s?.url_base ?? "",
		category: s?.category ?? "",
		download_dir: s?.download_dir ?? "",
		rate_limit_kb: s?.rate_limit ? String(Math.round(s.rate_limit / 1024)) : "",
		concurrent_downloads: s?.concurrent_downloads ? String(s.concurrent_downloads) : "",
	};
}

/// Seed the built-in HTTP client's form, pre-filling from its row when present.
export function builtinFormFor(client?: ClientRow): BuiltinForm {
	const s = client ? parseClientSettings(client.settings) : null;
	return {
		download_dir: s?.download_dir || "./downloads",
		rate_limit_kb: s?.rate_limit ? String(Math.round(s.rate_limit / 1024)) : "",
		concurrent: String(s?.concurrent_downloads ?? 2),
		enabled: client?.enabled ?? true,
	};
}

/// Convert a draft into the API input shape (rate/concurrent only apply to http).
export function toInput(draft: Draft): DownloadClientInput {
	return {
		name: draft.name.trim(),
		implementation: draft.implementation,
		host: draft.host,
		port: draft.port,
		username: draft.username,
		password: draft.password,
		url_base: draft.url_base,
		category: draft.category,
		download_dir: draft.download_dir,
		...(draft.implementation === "http"
			? {
					rate_limit: draft.rate_limit_kb
						? Math.round(Number(draft.rate_limit_kb) * 1024)
						: undefined,
					concurrent_downloads: draft.concurrent_downloads
						? Number(draft.concurrent_downloads)
						: undefined,
				}
			: {}),
	};
}

/// Build the API input for the built-in HTTP client from its form state.
export function builtinInput(form: BuiltinForm): DownloadClientInput {
	return {
		name: "HTTP Direct",
		implementation: "http",
		host: "",
		port: 0,
		username: "",
		password: "",
		url_base: "",
		category: "",
		download_dir: form.download_dir,
		rate_limit: form.rate_limit_kb ? Math.round(Number(form.rate_limit_kb) * 1024) : undefined,
		concurrent_downloads: form.concurrent ? Number(form.concurrent) : undefined,
		enabled: form.enabled,
	};
}

/// Validate an add-flow draft. The edit flow only requires a name; use
/// `draft.name.trim()` there to preserve that looser rule.
export function validateDraft(draft: Draft) {
	if (!draft.name.trim()) {
		return { success: false as const, error: "Name is required" };
	}
	if (draft.implementation !== "http" && !draft.host.trim()) {
		return { success: false as const, error: "Host is required" };
	}
	return { success: true as const };
}

/// Server state + mutations for the download-clients settings page. Returns the
/// projected client list (server rows with pending/error/test affordances
/// layered on) plus the actions; the route holds no other server state.
export function createDownloadClients() {
	// Failed-persist bookkeeping — scoped to this factory, touched only by the
	// actions, layered back onto rows by the projection.
	const rowErrors = new Map<number, RowError>();

	// Authoritative server rows (+optimistic overlay during actions).
	const [serverRows, setServerRows] = createOptimisticStore<{
		download_clients: StoredClient[];
	}>(
		async () => {
			const data = await settingsApi.listDownloadClients();
			return { download_clients: data.download_clients };
		},
		{ download_clients: [] },
	);

	const [testResults, setTestResults] = createStore<Record<number, TestResult>>({});

	// Projected view: server rows with affordances layered per row.
	const clients = createProjection(
		() => ({
			download_clients: serverRows.download_clients.map((row) => ({
				...row,
				error: rowErrors.get(row.id),
				test: testResults[row.id],
			})),
		}),
		{ download_clients: [] },
	);

	const removeClient = action(function* (row: ClientRow) {
		setServerRows((s) => {
			s.download_clients = s.download_clients.filter((c) => c.id !== row.id);
		});
		try {
			yield settingsApi.removeDownloadClient(row.id);
			rowErrors.delete(row.id);
		} catch {
			rowErrors.set(row.id, { op: "remove", args: [row] });
		}
		refresh(serverRows);
	});

	const retryRemoveClient = action(function* (id: number) {
		setServerRows((s) => {
			const r = s.download_clients.find((c) => c.id === id);
			if (r) r.pending = true;
		});
		try {
			yield settingsApi.removeDownloadClient(id);
			rowErrors.delete(id);
		} catch {
			/* row keeps its retry affordance */
		}
		refresh(serverRows);
	});

	/// Optimistic enable/disable; throws so callers can surface the failure
	/// (refresh in finally reverts the optimistic flip).
	const setClientEnabled = action(function* (id: number, enabled: boolean) {
		setServerRows((s) => {
			const r = s.download_clients.find((c) => c.id === id);
			if (r) r.enabled = enabled;
		});
		try {
			yield settingsApi.setDownloadClientEnabled(id, enabled);
			rowErrors.delete(id);
		} finally {
			refresh(serverRows);
		}
	});

	const addClient = action(function* (input: DownloadClientInput) {
		const tempId = -Date.now();
		setServerRows((s) => {
			s.download_clients.push({
				id: tempId,
				name: input.name,
				implementation: input.implementation,
				settings: buildClientSettings(input),
				enabled: input.enabled ?? true,
				priority: input.priority ?? 0,
				pending: true,
			});
		});
		yield settingsApi.addDownloadClient({ ...input, enabled: true });
		refresh(serverRows);
	});

	const updateClient = action(function* (id: number, input: DownloadClientInput) {
		setServerRows((s) => {
			const r = s.download_clients.find((c) => c.id === id);
			if (r) {
				r.name = input.name;
				r.implementation = input.implementation;
				r.settings = buildClientSettings(input);
				r.priority = input.priority ?? r.priority;
				r.pending = true;
			}
		});
		yield settingsApi.updateDownloadClient(id, input);
		refresh(serverRows);
	});

	/// Create or update the built-in HTTP client from its form input.
	const upsertBuiltin = action(function* (input: DownloadClientInput) {
		const row = serverRows.download_clients.find((c) => isBuiltinClient(c));
		if (row) {
			yield settingsApi.updateDownloadClient(row.id, input);
		} else {
			yield settingsApi.addDownloadClient(input);
		}
		refresh(serverRows);
	});

	/// Optimistic enable/disable for the built-in client, creating it first if
	/// the server doesn't know it yet. Throws on failure (route surfaces it).
	const setBuiltinEnabled = action(function* (
		row: ClientRow | undefined,
		enabled: boolean,
		input: DownloadClientInput,
	) {
		if (row) {
			setServerRows((s) => {
				const r = s.download_clients.find((c) => c.id === row.id);
				if (r) r.enabled = enabled;
			});
			try {
				yield settingsApi.setDownloadClientEnabled(row.id, enabled);
			} finally {
				refresh(serverRows);
			}
		} else {
			yield settingsApi.addDownloadClient({ ...input, enabled });
			refresh(serverRows);
		}
	});

	const testClient = action(function* (id: number) {
		setTestResults((r) => {
			r[id] = { status: "testing" };
		});
		try {
			const data = yield settingsApi.testDownloadClient(id);
			setTestResults((r) => {
				r[id] = {
					status: data.success ? "success" : "error",
					message: data.message,
					version: data.version,
					default_save_path: data.default_save_path,
				};
			});
		} catch (e) {
			setTestResults((r) => {
				r[id] = {
					status: "error",
					message: e instanceof Error ? e.message : "Test failed",
				};
			});
		}
	});

	/// Ensure the built-in client exists (creating it when missing), then test
	/// it and resolve to the result. Plain async rather than an action because
	/// the caller needs the returned result.
	const testBuiltin = async (input: DownloadClientInput): Promise<TestResult> => {
		let row = serverRows.download_clients.find((c) => isBuiltinClient(c));
		if (!row) {
			await settingsApi.addDownloadClient(input);
			refresh(serverRows);
			row = serverRows.download_clients.find((c) => isBuiltinClient(c));
		}
		if (!row) return { status: "error", message: "Failed to create built-in client" };
		const data = await settingsApi.testDownloadClient(row.id);
		return {
			status: data.success ? "success" : "error",
			message: data.message,
			version: data.version,
			default_save_path: data.default_save_path,
		};
	};

	const testAllClients = action(function* () {
		for (const c of serverRows.download_clients) {
			if (isBuiltinClient(c)) continue;
			try {
				yield testClient(c.id);
			} catch {
				/* recorded by testClient */
			}
			yield new Promise((r) => setTimeout(r, 200));
		}
	});

	return [
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
	] as const;
}
