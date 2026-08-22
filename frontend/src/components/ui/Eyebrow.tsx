import type { Element } from "solid-js";

/// Mono small-caps metadata label — the "EP 01 · 21 MINS" column voice.
export function Eyebrow(props: { class?: string; children?: Element }) {
	return (
		<span
			class={`font-meta text-xs tracking-widest uppercase text-ink-500${props.class ? ` ${props.class}` : ""}`}
		>
			{props.children}
		</span>
	);
}

export default Eyebrow;
