import type { Component, ParentProps } from "solid-js";
import { A } from "@solidjs/router";

export const Layout: Component<ParentProps> = (props) => {
  return (
    <div class="min-h-screen bg-gray-950 text-gray-100">
      <nav class="border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <h1 class="text-lg font-bold text-indigo-400">ReadingRoom</h1>
        <A href="/" class="text-sm hover:text-indigo-300" end>
          Dashboard
        </A>
        <A href="/authors" class="text-sm hover:text-indigo-300">
          Authors
        </A>
        <A href="/books" class="text-sm hover:text-indigo-300">
          Books
        </A>
      </nav>
      <main class="p-6">{props.children}</main>
    </div>
  );
};
