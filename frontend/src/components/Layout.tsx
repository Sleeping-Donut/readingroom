import { useNavigate } from "@solidjs/router";
import { createSignal, type Component, type ParentProps, For, Show } from "solid-js";

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
			<nav class="border-b border-gray-800 px-4 py-3 sm:px-6">
				<div class="flex items-center gap-4">
					<h1 class="text-lg font-bold text-indigo-400">ReadingRoom</h1>

					{/* Desktop navigation */}
					<div class="ml-4 hidden items-center gap-6 md:flex">
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
								<button
									onClick={handleLogout}
									class="text-sm text-gray-500 hover:text-gray-300"
								>
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
						class="ml-auto inline-flex h-10 w-10 items-center justify-center rounded text-gray-300 transition-colors hover:bg-gray-800 md:hidden"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							class="h-6 w-6"
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
						class="fixed inset-0 z-40 bg-black/70 md:hidden"
						onClick={() => setOpen(false)}
						aria-hidden="true"
					/>
					<div
						id="mobile-menu"
						class="relative z-50 mt-3 flex flex-col gap-1 border-t border-gray-800 bg-gray-950 px-1 pt-3 pb-3 md:hidden"
					>
						<For each={links()}>
							{(link) => (
								<a
									href={String(link.href)}
									onClick={() => setOpen(false)}
									class="rounded px-3 py-2 text-sm transition-colors hover:bg-gray-800 hover:text-indigo-300"
								>
									{link.label}
								</a>
							)}
						</For>
						<Show when={authEnabled() && user()}>
							<div class="mt-1 flex items-center justify-between border-t border-gray-800 px-3 py-2">
								<span class="text-sm text-gray-500">{user()?.username}</span>
								<button
									onClick={handleLogout}
									class="text-sm text-gray-500 hover:text-gray-300"
								>
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
