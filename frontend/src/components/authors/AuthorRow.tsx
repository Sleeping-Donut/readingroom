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
      class="flex items-center gap-4 p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-indigo-600 transition-colors"
    >
      <AuthorCover
        src={props.imageUrl}
        alt={props.name}
        name={props.name}
        class="w-10 h-12 shrink-0 rounded"
        placeholder
      />
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">{props.name}</p>
        <p class="text-xs text-gray-400 truncate">{props.subtitle}</p>
      </div>
      <span class="text-gray-500 shrink-0">›</span>
    </a>
  );
}
