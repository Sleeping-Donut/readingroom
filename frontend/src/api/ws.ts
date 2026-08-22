import * as v from "valibot";

type WsCallback = (event: string, data: unknown) => void;

const WS_MESSAGE_SCHEMA = v.object({
	event: v.string(),
	data: v.unknown(),
});

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Map<string, Set<WsCallback>>();

function wsUrl(): string {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}/ws`;
}

function connect() {
	// Single-flight: never open a second socket while one exists or a reconnect is pending.
	if (ws || reconnectTimer) return;

	const socket = new WebSocket(wsUrl());
	ws = socket;

	socket.onmessage = (event) => {
		const parsed = v.safeParse(
			WS_MESSAGE_SCHEMA,
			(() => {
				try {
					return JSON.parse(event.data);
				} catch (e) {
					console.error("WS parse error", e);
					return null;
				}
			})(),
		);
		if (!parsed.success) return;
		const { event: eventType, data } = parsed.output;
		const cbs = listeners.get(eventType);
		if (cbs) cbs.forEach((cb) => cb(eventType, data));
		const allCbs = listeners.get("*");
		if (allCbs) allCbs.forEach((cb) => cb(eventType, data));
	};

	socket.onclose = () => {
		if (ws === socket) ws = null;
		// Stop reconnecting if nobody is listening anymore.
		if (listeners.size === 0) return;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, 5000);
	};

	socket.onerror = () => socket.close();
}

export function subscribe(event: string, callback: WsCallback): () => void {
	if (!ws && !reconnectTimer) connect();
	let set = listeners.get(event);
	if (!set) {
		set = new Set();
		listeners.set(event, set);
	}
	set.add(callback);

	return () => {
		set.delete(callback);
		if (set.size === 0) listeners.delete(event);
		// If nothing is listening, drop the socket and cancel any pending reconnect.
		if (listeners.size === 0) {
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			if (ws) {
				ws.close();
				ws = null;
			}
		}
	};
}

export function subscribeAll(callback: WsCallback): () => void {
	return subscribe("*", callback);
}
