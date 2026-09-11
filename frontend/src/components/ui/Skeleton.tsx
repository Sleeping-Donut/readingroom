import type { JSX } from "@solidjs/web";

/// A pulsing placeholder block. Compose these into skeletons for loading
/// boundaries so the layout doesn't jump when the real content arrives.
export function Skeleton(props: { class?: string; children?: JSX.Element }) {
	return (
		<div aria-hidden="true" class={["animate-pulse rounded-sm bg-paper-200", props.class]}>
			{props.children}
		</div>
	);
}

export default Skeleton;
