import type { JSX } from "@solidjs/web";

import { createMarker, makeSearchRegex } from "@solid-primitives/marker";
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
	highlight?: string;
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
	const mark = createMarker((m) => (
		<mark class="rounded-sm bg-accent-wash px-0.5 text-ink-900">{m()}</mark>
	));
	const title = (
		<p class="truncate font-display text-lg text-ink-900">
			{props.highlight ? mark(props.title, makeSearchRegex(props.highlight)) : props.title}
		</p>
	);
	const status = (
		<div class="mt-1.5">
			<StatusBadge status={props.status} />
		</div>
	);

	if (props.cardLink) {
		return (
			<a
				href={props.href}
				class="flex items-center gap-4 rounded-sm border border-rule bg-paper-100 p-3 transition-colors hover:border-ink-900"
			>
				{cover}
				<div class="min-w-0 flex-1">
					{title}
					<p class="truncate text-xs text-ink-700">{props.subtitle}</p>
					{status}
				</div>
				{props.footer}
			</a>
		);
	}
	return (
		<div class="flex items-center gap-4 rounded-sm border border-rule bg-paper-100 p-3 transition-colors">
			<Show when={props.href} fallback={cover}>
				<a href={props.href} class="shrink-0">
					{cover}
				</a>
			</Show>
			<div class="min-w-0 flex-1">
				<Show when={props.href} fallback={title}>
					<a href={props.href} class="block hover:text-accent">
						{title}
					</a>
				</Show>
				<p class="mt-0.5 truncate text-xs text-ink-500">{props.subtitle}</p>
				{status}
			</div>
			{props.footer}
		</div>
	);
}
