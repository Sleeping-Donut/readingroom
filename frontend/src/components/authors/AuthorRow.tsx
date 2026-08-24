import type { JSX } from "@solidjs/web";

import { createMarker, makeSearchRegex } from "@solid-primitives/marker";

import { AuthorCover } from "./AuthorCover";

export function AuthorRow(props: {
	highlight?: string;
	href: JSX.AnchorHTMLAttributes<HTMLAnchorElement>["href"];
	name: string;
	subtitle: string;
	imageUrl?: string;
}) {
	const mark = createMarker((m) => (
		<mark class="rounded-sm bg-accent-wash px-0.5 text-ink-900">{m()}</mark>
	));
	return (
		<a
			href={props.href}
			class="flex items-center gap-4 rounded-lg border border-rule bg-paper-100 p-3 transition-colors hover:border-ink-900"
		>
			<AuthorCover
				src={props.imageUrl}
				alt={props.name}
				name={props.name}
				class="h-12 w-10 shrink-0 rounded"
				placeholder
			/>
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">
					{props.highlight
						? mark(props.name, makeSearchRegex(props.highlight))
						: props.name}
				</p>
				<p class="truncate text-xs text-ink-700">{props.subtitle}</p>
			</div>
			<span class="shrink-0 text-ink-500">›</span>
		</a>
	);
}
