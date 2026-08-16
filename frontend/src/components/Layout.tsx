import { useNavigate } from "@solidjs/router";
import { createSignal, type Component, type ParentProps } from "solid-js";
import { For, Show } from "solid-js";

import { user, authEnabled, logout } from "../api/auth";
import { paths } from "../router";

export const Layout: Component<ParentProps> = (props) => {
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);

  function handleLogout() {
    logout();
    navigate(paths.login, { replace: true });
  }

  const links = () => [
    { href: paths(), label: "Dashboard" },
    { href: paths.authors, label: "Authors" },
    { href: paths.books, label: "Books" },
    { href: paths.activity, label: "Activity" },
    { href: paths.calendar, label: "Calendar" },
    { href: paths.wanted, label: "Wanted" },
    { href: paths.queue, label: "Queue" },
    { href: paths.settings, label: "Settings" },
  ];

  return (
    <div class="min-h-screen bg-gray-950 text-gray-100">
      <nav class="border-b border-gray-800 px-4 sm:px-6 py-3">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-bold text-indigo-400">ReadingRoom</h1>

          {/* Desktop navigation */}
          <div class="hidden md:flex items-center gap-6 ml-4">
            <For each={links()}>
              {(link) => (
                <a href={String(link.href)} class="text-sm hover:text-indigo-300">
                  {link.label}
                </a>
              )}
            </For>
            <div class="ml-auto flex items-center gap-3">
              <Show when={authEnabled() && user()}>
                <span class="text-sm text-gray-500">{user()?.username}</span>
                <button onClick={handleLogout} class="text-sm text-gray-500 hover:text-gray-300">
                  Logout
                </button>
              </Show>
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => {
              setOpen(!open());
            }}
            aria-label="Toggle navigation menu"
            aria-expanded={open() ? "true" : "false"}
            aria-controls="mobile-menu"
            class="md:hidden ml-auto inline-flex items-center justify-center w-10 h-10 rounded text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="w-6 h-6"
            >
              <Show when={!open()} fallback={<path d="M6 6l12 12M6 18L18 6" />}>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </Show>
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        <Show when={open()}>
          <div
            id="mobile-menu"
            class="md:hidden mt-3 flex flex-col gap-1 border-t border-gray-800 pt-3"
          >
            <For each={links()}>
              {(link) => (
                <a
                  href={String(link.href)}
                  onClick={() => setOpen(false)}
                  class="px-3 py-2 rounded text-sm hover:bg-gray-800 hover:text-indigo-300 transition-colors"
                >
                  {link.label}
                </a>
              )}
            </For>
            <Show when={authEnabled() && user()}>
              <div class="flex items-center justify-between px-3 py-2 mt-1 border-t border-gray-800">
                <span class="text-sm text-gray-500">{user()?.username}</span>
                <button onClick={handleLogout} class="text-sm text-gray-500 hover:text-gray-300">
                  Logout
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </nav>
      <main class="p-4 sm:p-6">{props.children}</main>
    </div>
  );
};
