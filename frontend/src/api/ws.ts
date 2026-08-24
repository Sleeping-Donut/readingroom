import { createReconnectingWS } from "@solid-primitives/websocket";
import { createRoot } from "solid-js";
import * as v from "valibot";

type WsCallback = (event: string, data: unknown) => void;

const WS_MESSAGE_SCHEMA = v.object({
	event: v.string(),
	data: v.unknown(),
});

const listeners = new Map<string, Set<WsCallback>>();

function wsUrl(): string {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}/ws`;
}

// App-lifetime singleton in a never-disposed root: the primitive owns
// reconnection (5s backoff, retries while anyone is listening).
const ws = createRoot(() =>
	createReconnectingWS(wsUrl(), undefined, { delay: 5000, retries: Infinity }),
);

ws.addEventListener("message", (event) => {
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
});

export function subscribe(event: string, callback: WsCallback): () => void {
	let set = listeners.get(event);
	if (!set) {
		set = new Set();
		listeners.set(event, set);
	}
	set.add(callback);

	return () => {
		set.delete(callback);
		if (set.size === 0) listeners.delete(event);
	};
}

export function subscribeAll(callback: WsCallback): () => void {
	return subscribe("*", callback);
}
