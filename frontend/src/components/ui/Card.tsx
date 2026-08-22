import type { Element } from "solid-js";

/// Paper surface: hairline rule, raised tone, near-square corners. The
/// replacement for `bg-gray-900 rounded-lg border-gray-800` panels.
export function Card(props: { class?: string; children?: Element }) {
	return (
		<div
			class={`rounded-sm border border-rule bg-paper-100${props.class ? ` ${props.class}` : ""}`}
		>
			{props.children}
		</div>
	);
}

export default Card;
