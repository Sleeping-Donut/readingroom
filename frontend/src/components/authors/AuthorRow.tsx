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
			class="gap-4 p-3 bg-gray-900 rounded-lg border-gray-800 hover:border-indigo-600 flex items-center border transition-colors"
		>
			<AuthorCover
				src={props.imageUrl}
				alt={props.name}
				name={props.name}
				class="w-10 h-12 rounded shrink-0"
				placeholder
			/>
			<div class="min-w-0 flex-1">
				<p class="font-medium truncate">{props.name}</p>
				<p class="text-xs text-gray-400 truncate">{props.subtitle}</p>
			</div>
			<span class="text-gray-500 shrink-0">›</span>
		</a>
	);
}
