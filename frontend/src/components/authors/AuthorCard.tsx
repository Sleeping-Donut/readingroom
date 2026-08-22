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
			class="block rounded-lg border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-indigo-600"
		>
			<AuthorCover
				src={props.imageUrl}
				alt={props.name}
				name={props.name}
				class="mb-3 h-48 w-full rounded"
			/>
			<p class="truncate font-medium">{props.name}</p>
			<p class="mt-1 text-xs text-gray-400">{props.subtitle}</p>
		</a>
	);
}
