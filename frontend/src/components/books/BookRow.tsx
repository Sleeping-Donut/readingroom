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
			class="w-10 h-14 rounded shrink-0"
			emojiClass={props.coverEmojiClass}
		/>
	);
	const title = <p class="font-medium truncate">{props.title}</p>;
	const status = (
		<div class="mt-1.5">
			<StatusBadge status={props.status} />
		</div>
	);

	if (props.cardLink) {
		return (
			<a
				href={props.href}
				class="gap-4 p-3 bg-gray-900 rounded-lg border-gray-800 hover:border-indigo-600 flex items-center border transition-colors"
			>
				{cover}
				<div class="min-w-0 flex-1">
					{title}
					<p class="text-xs text-gray-400 truncate">{props.subtitle}</p>
					{status}
				</div>
				{props.footer}
			</a>
		);
	}
	return (
		<div class="gap-4 p-3 bg-gray-900 rounded-lg border-gray-800 flex items-center border">
			<Show when={props.href} fallback={cover}>
				<a href={props.href} class="shrink-0">
					{cover}
				</a>
			</Show>
			<div class="min-w-0 flex-1">
				<Show when={props.href} fallback={title}>
					<a href={props.href} class="hover:text-indigo-300 block">
						{title}
					</a>
				</Show>
				<p class="text-xs text-gray-400 mt-0.5 truncate">{props.subtitle}</p>
				{status}
			</div>
			{props.footer}
		</div>
	);
}
