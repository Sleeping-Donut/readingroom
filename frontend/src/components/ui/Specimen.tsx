import { Show, type Element } from "solid-js";

/// Empty-state specimen: oversized display serif line over a small eyebrow,
/// with an optional muted detail line underneath.
export function Specimen(props: { label?: string; detail?: string; children?: Element }) {
	return (
		<div class="py-16 text-center">
			<Show when={props.label}>
				{(label) => (
					<p class="mb-2 font-meta text-xs tracking-widest text-ink-500 uppercase">
						{label()}
					</p>
				)}
			</Show>
			<p class="font-display text-3xl text-ink-900">{props.children}</p>
			<Show when={props.detail}>
				<p class="mt-2 text-sm text-ink-500">{props.detail}</p>
			</Show>
		</div>
	);
}

export default Specimen;
