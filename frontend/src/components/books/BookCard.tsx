import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { BookCover } from "./BookCover";

export function BookCard(props: {
  coverSrc?: string;
  title: string;
  subtitle: string;
  href?: JSX.AnchorHTMLAttributes<HTMLAnchorElement>["href"];
  cardLink?: boolean;
  footer?: JSX.Element;
}) {
  const cover = (
    <BookCover
      src={props.coverSrc}
      alt={props.title}
      class="w-full aspect-[2/3] rounded mb-3"
      emojiClass="text-3xl"
    />
  );
  const title = <p class="font-medium truncate">{props.title}</p>;

  if (props.cardLink) {
    return (
      <a
        href={props.href}
        class="block p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-indigo-600 transition-colors"
      >
        {cover}
        {title}
        <p class="text-xs text-gray-400 mt-0.5 truncate">{props.subtitle}</p>
        {props.footer}
      </a>
    );
  }
  return (
    <div class="block p-3 bg-gray-900 rounded-lg border border-gray-800 transition-colors">
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
      <p class="text-xs text-gray-400 mt-0.5 truncate">{props.subtitle}</p>
      {props.footer}
    </div>
  );
}
