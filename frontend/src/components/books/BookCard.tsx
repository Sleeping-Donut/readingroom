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
	const title = <p class="truncate font-display text-lg text-ink-900">{props.title}</p>;
	const status = (
		<div class="mt-2">
			<StatusBadge status={props.status} />
		</div>
	);

	if (props.cardLink) {
		return (
			<a
				href={props.href}
				class="block rounded-sm border border-rule bg-paper-100 p-3 transition-colors hover:border-ink-900"
			>
				{cover}
				{title}
				<p class="mt-0.5 truncate text-xs text-ink-500">{props.subtitle}</p>
				{status}
				{props.footer}
			</a>
		);
	}
	return (
		<div class="block rounded-sm border border-rule bg-paper-100 p-3 transition-colors">
			<Show when={props.href} fallback={cover}>
				<a href={props.href} class="block">
					{cover}
				</a>
			</Show>
			<Show when={props.href} fallback={title}>
				<a href={props.href} class="block hover:text-accent">
					{title}
				</a>
			</Show>
			<p class="mt-0.5 truncate text-xs text-ink-500">{props.subtitle}</p>
			{status}
			{props.footer}
		</div>
	);
}
