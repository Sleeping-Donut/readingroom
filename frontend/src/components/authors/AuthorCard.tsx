import type { JSX } from "@solidjs/web";

import { createMarker, makeSearchRegex } from "@solid-primitives/marker";

import { AuthorCover } from "./AuthorCover";

export function AuthorCard(props: {
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
			class="block rounded-lg border border-rule bg-paper-100 p-4 transition-colors hover:border-ink-900"
		>
			<AuthorCover
				src={props.imageUrl}
				alt={props.name}
				name={props.name}
				class="mb-3 h-48 w-full rounded"
			/>
			<p class="truncate font-medium">
				{props.highlight ? mark(props.name, makeSearchRegex(props.highlight)) : props.name}
			</p>
			<p class="mt-1 text-xs text-ink-700">{props.subtitle}</p>
		</a>
	);
}
