import type { JSX } from "@solidjs/web";

import { Show } from "solid-js";

import { BookCover } from "./BookCover";
import { StatusBadge } from "./StatusBadge";

export function BookRow(props: {
	coverSrc?: string;
	title: string;
	subtitle: string;
	href?: JSX.AnchorHTMLAttributes<HTMLAnchorElement>["href"];
	cardLink?: boolean;
	coverEmojiClass?: string;
	footer?: JSX.Element;
	status?: string;
}) {
	const cover = (
		<BookCover
			src={props.coverSrc}
			alt={props.title}
			class="h-14 w-10 shrink-0 rounded"
			emojiClass={props.coverEmojiClass}
		/>
	);
	const title = <p class="truncate font-medium">{props.title}</p>;
	const status = (
		<div class="mt-1.5">
			<StatusBadge status={props.status} />
		</div>
	);

	if (props.cardLink) {
		return (
			<a
				href={props.href}
				class="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 p-3 transition-colors hover:border-indigo-600"
			>
				{cover}
				<div class="min-w-0 flex-1">
					{title}
					<p class="truncate text-xs text-gray-400">{props.subtitle}</p>
					{status}
				</div>
				{props.footer}
			</a>
		);
	}
	return (
		<div class="flex items-center gap-4 rounded-lg border border-gray-800 bg-gray-900 p-3">
			<Show when={props.href} fallback={cover}>
				<a href={props.href} class="shrink-0">
					{cover}
				</a>
			</Show>
			<div class="min-w-0 flex-1">
				<Show when={props.href} fallback={title}>
					<a href={props.href} class="block hover:text-indigo-300">
						{title}
					</a>
				</Show>
				<p class="mt-0.5 truncate text-xs text-gray-400">{props.subtitle}</p>
				{status}
			</div>
			{props.footer}
		</div>
	);
}
