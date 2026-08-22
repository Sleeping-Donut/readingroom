import type { Element } from "solid-js";

/// Small-caps status chip with leading dot. Colors come from the desaturated
/// status tokens (good/bad/pending); default is neutral ink.
const dotByTone = {
	neutral: "bg-ink-500",
	good: "bg-good",
	bad: "bg-bad",
	pending: "bg-pending",
} as const;

export function Badge(props: {
	tone?: keyof typeof dotByTone;
	class?: string;
	children?: Element;
}) {
	return (
		<span
			class={`inline-flex items-center gap-1.5 font-meta text-xs tracking-widest uppercase text-ink-700${props.class ? ` ${props.class}` : ""}`}
		>
			<span class={`size-1.5 rounded-full ${dotByTone[props.tone ?? "neutral"]}`} />
			{props.children}
		</span>
	);
}

export default Badge;
