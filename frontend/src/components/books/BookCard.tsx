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
			class="mb-3 aspect-[2/3] w-full rounded"
			emojiClass="text-3xl"
		/>
	);
	const title = <p class="truncate font-medium">{props.title}</p>;
	const status = (
		<div class="mt-2">
			<StatusBadge status={props.status} />
		</div>
	);

	if (props.cardLink) {
		return (
			<a
				href={props.href}
				class="block rounded-lg border border-gray-800 bg-gray-900 p-3 transition-colors hover:border-indigo-600"
			>
				{cover}
				{title}
				<p class="mt-0.5 truncate text-xs text-gray-400">{props.subtitle}</p>
				{status}
				{props.footer}
			</a>
		);
	}
	return (
		<div class="block rounded-lg border border-gray-800 bg-gray-900 p-3 transition-colors">
			<Show when={props.href} fallback={cover}>
				<a href={props.href} class="block">
					{cover}
				</a>
			</Show>
			<Show when={props.href} fallback={title}>
				<a href={props.href} class="block hover:text-indigo-300">
					{title}
				</a>
			</Show>
			<p class="mt-0.5 truncate text-xs text-gray-400">{props.subtitle}</p>
			{status}
			{props.footer}
		</div>
	);
}
