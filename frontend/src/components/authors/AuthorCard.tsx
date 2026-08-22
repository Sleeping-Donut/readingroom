import type { JSX } from "@solidjs/web";

import { AuthorCover } from "./AuthorCover";

export function AuthorCard(props: {
	href: JSX.AnchorHTMLAttributes<HTMLAnchorElement>["href"];
	name: string;
	subtitle: string;
	imageUrl?: string;
}) {
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
			<p class="truncate font-medium">{props.name}</p>
			<p class="mt-1 text-xs text-ink-700">{props.subtitle}</p>
		</a>
	);
}
