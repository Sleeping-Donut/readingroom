import { Show } from "solid-js";

import { Badge } from "../ui";

const STATUSES: Record<string, { label: string; tone: "pending" | "good" | "neutral" }> = {
	tracked: { label: "Tracked", tone: "neutral" },
	getting: { label: "Getting", tone: "pending" },
	have: { label: "Have", tone: "good" },
};

/// Small-caps status line with a leading status dot.
export function StatusBadge(props: { status?: string }) {
	const entry = () => (props.status ? STATUSES[props.status] : undefined);
	return (
		<Show when={entry()}>
			{(s) => (
				<Badge tone={s().tone} class="mt-2">
					{s().label}
				</Badge>
			)}
		</Show>
	);
}
