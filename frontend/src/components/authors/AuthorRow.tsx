import type { JSX } from "@solidjs/web";

import { AuthorCover } from "./AuthorCover";

export function AuthorRow(props: {
	href: JSX.AnchorHTMLAttributes<HTMLAnchorElement>["href"];
	name: string;
	subtitle: string;
	imageUrl?: string;
}) {
	return (
		<a
			href={props.href}
			class="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 p-3 transition-colors hover:border-indigo-600"
		>
			<AuthorCover
				src={props.imageUrl}
				alt={props.name}
				name={props.name}
				class="h-12 w-10 shrink-0 rounded"
				placeholder
			/>
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">{props.name}</p>
				<p class="truncate text-xs text-gray-400">{props.subtitle}</p>
			</div>
			<span class="shrink-0 text-gray-500">›</span>
		</a>
	);
}
