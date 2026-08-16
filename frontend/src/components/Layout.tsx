import type { Component, ParentProps } from "solid-js";

import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import { user, authEnabled, logout } from "../api/auth";
import { paths } from "../router";

export const Layout: Component<ParentProps> = (props) => {
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate(paths.login, { replace: true });
  }

  return (
    <div class="min-h-screen bg-gray-950 text-gray-100">
      <nav class="border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <h1 class="text-lg font-bold text-indigo-400">ReadingRoom</h1>
        <a href={paths()} class="text-sm hover:text-indigo-300">
          Dashboard
        </a>
        <a href={paths.authors} class="text-sm hover:text-indigo-300">
          Authors
        </a>
        <a href={paths.books} class="text-sm hover:text-indigo-300">
          Books
        </a>
        <a href={paths.activity} class="text-sm hover:text-indigo-300">
          Activity
        </a>
        <a href={paths.calendar} class="text-sm hover:text-indigo-300">
          Calendar
        </a>
        <a href={paths.wanted} class="text-sm hover:text-indigo-300">
          Wanted
        </a>
        <a href={paths.queue} class="text-sm hover:text-indigo-300">
          Queue
        </a>
        <a href={paths.settings} class="text-sm hover:text-indigo-300">
          Settings
        </a>
        <div class="ml-auto flex items-center gap-3">
          <Show when={authEnabled() && user()}>
            <span class="text-sm text-gray-500">{user()?.username}</span>
            <button onClick={handleLogout} class="text-sm text-gray-500 hover:text-gray-300">
              Logout
            </button>
          </Show>
        </div>
      </nav>
      <main class="p-6">{props.children}</main>
    </div>
  );
};
