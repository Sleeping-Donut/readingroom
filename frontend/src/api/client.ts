const BASE = "/api/v1";

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null) {
	onUnauthorized = cb;
}

function getToken(): string | null {
	try {
		return localStorage.getItem("readingroom_token");
	} catch {
		return null;
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const token = getToken();
	const headers = new Headers();
	// Multipart uploads set their own Content-Type (with boundary).
	if (!(init?.body instanceof FormData)) headers.set("Content-Type", "application/json");
	if (token) headers.set("Authorization", `Bearer ${token}`);
	if (init?.headers) {
		new Headers(init.headers).forEach((v, k) => headers.set(k, v));
	}

	const res = await fetch(`${BASE}${path}`, {
		headers,
		...init,
	});
	if (res.status === 401) {
		localStorage.removeItem("readingroom_token");
		localStorage.removeItem("readingroom_user");
		onUnauthorized?.();
	}
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
	}
	if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
	return res.json();
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body?: unknown) =>
		request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
	put: <T>(path: string, body: unknown) =>
		request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
	delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
	upload: <T>(path: string, formData: FormData) =>
		request<T>(path, { method: "POST", body: formData }),
};
