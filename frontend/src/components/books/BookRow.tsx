import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { BookCover } from "./BookCover";

export function BookRow(props: {
  coverSrc?: string;
  title: string;
  subtitle: string;
  href?: JSX.AnchorHTMLAttributes<HTMLAnchorElement>["href"];
  cardLink?: boolean;
  coverEmojiClass?: string;
  footer?: JSX.Element;
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

  if (props.cardLink) {
    return (
      <a
        href={props.href}
        class="flex items-center gap-4 p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-indigo-600 transition-colors"
      >
        {cover}
        <div class="flex-1 min-w-0">
          {title}
          <p class="text-xs text-gray-400 truncate">{props.subtitle}</p>
        </div>
        {props.footer}
      </a>
    );
  }
  return (
    <div class="flex items-center gap-4 p-3 bg-gray-900 rounded-lg border border-gray-800">
      <Show when={props.href} fallback={cover}>
        <a href={props.href} class="shrink-0">
          {cover}
        </a>
      </Show>
      <div class="flex-1 min-w-0">
        <Show when={props.href} fallback={title}>
          <a href={props.href} class="block hover:text-indigo-300">
            {title}
          </a>
        </Show>
        <p class="text-xs text-gray-400 mt-0.5 truncate">{props.subtitle}</p>
      </div>
      {props.footer}
    </div>
  );
}
