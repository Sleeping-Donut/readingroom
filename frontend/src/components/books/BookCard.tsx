import type { JSX } from "@solidjs/web";

import { Show } from "solid-js";

import { BookCover } from "./BookCover";
import { StatusBadge } from "./StatusBadge";

export function BookCard(props: {
	coverSrc?: string;
	title: string;
	subtitle: string;
	href?: JSX.AnchorHTMLAttributes<HTMLAnchorElement>["href"];
	cardLink?: boolean;
	footer?: JSX.Element;
	status?: string;
}) {
	const cover = (
		<BookCover
			src={props.coverSrc}
			alt={props.title}
			class="rounded mb-3 aspect-[2/3] w-full"
			emojiClass="text-3xl"
		/>
	);
	const title = <p class="font-medium truncate">{props.title}</p>;
	const status = (
		<div class="mt-2">
			<StatusBadge status={props.status} />
		</div>
	);

	if (props.cardLink) {
		return (
			<a
				href={props.href}
				class="p-3 bg-gray-900 rounded-lg border-gray-800 hover:border-indigo-600 block border transition-colors"
			>
				{cover}
				{title}
				<p class="text-xs text-gray-400 mt-0.5 truncate">{props.subtitle}</p>
				{status}
				{props.footer}
			</a>
		);
	}
	return (
		<div class="p-3 bg-gray-900 rounded-lg border-gray-800 block border transition-colors">
			<Show when={props.href} fallback={cover}>
				<a href={props.href} class="block">
					{cover}
				</a>
			</Show>
			<Show when={props.href} fallback={title}>
				<a href={props.href} class="hover:text-indigo-300 block">
					{title}
				</a>
			</Show>
			<p class="text-xs text-gray-400 mt-0.5 truncate">{props.subtitle}</p>
			{status}
			{props.footer}
		</div>
	);
}
