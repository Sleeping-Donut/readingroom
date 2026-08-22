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
		<div class="bg-gray-950 text-gray-100 min-h-screen">
			<nav class="border-gray-800 px-4 sm:px-6 py-3 border-b">
				<div class="gap-4 flex items-center">
					<h1 class="text-lg font-bold text-indigo-400">ReadingRoom</h1>

					{/* Desktop navigation */}
					<div class="md:flex gap-6 ml-4 hidden items-center">
						<For each={links()}>
							{(link) => (
								<a href={String(link.href)} class="text-sm hover:text-indigo-300">
									{link.label}
								</a>
							)}
						</For>
						<div class="gap-3 ml-auto flex items-center">
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
						class="md:hidden w-10 h-10 rounded text-gray-300 hover:bg-gray-800 ml-auto inline-flex items-center justify-center transition-colors"
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
						class="inset-0 bg-black/70 md:hidden fixed z-40"
						onClick={() => setOpen(false)}
						aria-hidden="true"
					/>
					<div
						id="mobile-menu"
						class="md:hidden mt-3 gap-1 border-gray-800 pt-3 bg-gray-950 px-1 pb-3 relative z-50 flex flex-col border-t"
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
							<div class="px-3 py-2 mt-1 border-gray-800 flex items-center justify-between border-t">
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
