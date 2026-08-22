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
			class="p-4 bg-gray-900 rounded-lg border-gray-800 hover:border-indigo-600 block border transition-colors"
		>
			<AuthorCover
				src={props.imageUrl}
				alt={props.name}
				name={props.name}
				class="h-48 rounded mb-3 w-full"
			/>
			<p class="font-medium truncate">{props.name}</p>
			<p class="text-xs text-gray-400 mt-1">{props.subtitle}</p>
		</a>
	);
}
