import { For } from "solid-js";

import { Badge } from "../ui";

type MediaKey = "ebook" | "audiobook";

const STATUS_LABELS: Record<string, string> = {
	tracked: "Tracked",
	getting: "Getting",
	have: "Have",
};

const TONE: Record<string, "neutral" | "pending" | "good"> = {
	tracked: "neutral",
	getting: "pending",
	have: "good",
};

const MEDIA: { key: MediaKey; label: string }[] = [
	{ key: "ebook", label: "Ebook" },
	{ key: "audiobook", label: "Audiobook" },
];

/// Per-media lifecycle chips for a book. Each chip carries the media's own
/// status and is dimmed when that media is not monitored, so "ebook had,
/// audiobook tracked" and split monitoring both read at a glance.
export function MediaStatusBadge(props: {
	media?: { ebook?: string; audiobook?: string };
	monitored?: boolean;
	monitoredAudiobook?: boolean;
}) {
	const items = () =>
		MEDIA.map((m) => {
			const status = props.media?.[m.key] ?? "tracked";
			const monitored =
				m.key === "ebook"
					? (props.monitored ?? false)
					: (props.monitoredAudiobook ?? false);
			return { ...m, status, monitored };
		});

	return (
		<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
			<For each={items()}>
				{(item) => (
					<span
						title={`${item.label}: ${STATUS_LABELS[item.status] ?? "Tracked"} · ${item.monitored ? "monitored" : "not monitored"}`}
					>
						<Badge
							tone={TONE[item.status] ?? "neutral"}
							class={item.monitored ? undefined : "opacity-40"}
						>
							{item.label}: {STATUS_LABELS[item.status] ?? "Tracked"}
						</Badge>
					</span>
				)}
			</For>
		</div>
	);
}

export default MediaStatusBadge;
