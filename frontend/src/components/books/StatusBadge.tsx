import { Show } from "solid-js";

const STATUSES: Record<string, { label: string; class: string }> = {
	tracked: {
		label: "Tracked",
		class: "bg-gray-800 text-gray-300 border border-gray-700",
	},
	getting: {
		label: "Getting",
		class: "bg-yellow-900/40 text-yellow-300 border border-yellow-700 animate-pulse",
	},
	have: {
		label: "Have",
		class: "bg-green-900/40 text-green-400 border border-green-800",
	},
};

export function StatusBadge(props: { status?: string }) {
	const entry = () => (props.status ? STATUSES[props.status] : undefined);
	return (
		<Show when={entry()}>
			{(s) => (
				<span class={["px-2 py-0.5 rounded text-xs font-medium inline-block", s().class]}>
					{s().label}
				</span>
			)}
		</Show>
	);
}
