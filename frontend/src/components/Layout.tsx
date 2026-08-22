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
		<div class="min-h-screen bg-paper-50 text-ink-900">
			<header>
				{/* Masthead row */}
				<div class="relative flex items-center justify-center border-b border-rule px-4 py-4">
					<button
						type="button"
						onClick={() => setOpen(!open())}
						aria-label="Toggle navigation menu"
						aria-expanded={open() ? "true" : "false"}
						aria-controls="mobile-menu"
						class="absolute left-4 inline-flex h-10 w-10 items-center justify-center rounded-sm text-ink-700 transition-colors hover:bg-paper-200 md:hidden"
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

					<a href={String(paths())} class="font-display text-3xl text-ink-900">
						ReadingRoom
					</a>

					{/* Desktop user controls */}
					<div class="absolute right-4 hidden items-center gap-3 md:flex">
						<Show when={authEnabled() && user()}>
							<span class="font-meta text-xs tracking-widest text-ink-500 uppercase">
								{user()?.username}
							</span>
							<button
								onClick={handleLogout}
								class="text-sm text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
							>
								Logout
							</button>
						</Show>
					</div>
				</div>

				{/* Desktop nav row */}
				<nav class="hidden justify-center gap-8 border-b border-rule py-2.5 md:flex">
					<For each={links()}>
						{(link) => (
							<a
								href={String(link.href)}
								class="border-b-2 border-transparent pb-1 font-meta text-xs tracking-widest text-ink-700 uppercase transition-colors hover:text-ink-900"
							>
								{link.label}
							</a>
						)}
					</For>
				</nav>

				{/* Mobile menu */}
				<Show when={open()}>
					<div
						class="fixed inset-0 z-40 bg-ink-900/40 md:hidden"
						onClick={() => setOpen(false)}
						aria-hidden="true"
					/>
					<div
						id="mobile-menu"
						class="relative z-50 flex flex-col border-b border-rule bg-paper-50 px-1 py-2 md:hidden"
					>
						<For each={links()}>
							{(link) => (
								<a
									href={String(link.href)}
									onClick={() => setOpen(false)}
									class="rounded-sm px-3 py-2 font-meta text-xs tracking-widest text-ink-700 uppercase transition-colors hover:bg-paper-200 hover:text-ink-900"
								>
									{link.label}
								</a>
							)}
						</For>
						<Show when={authEnabled() && user()}>
							<div class="mt-1 flex items-center justify-between border-t border-rule px-3 py-2">
								<span class="font-meta text-xs tracking-widest text-ink-500 uppercase">
									{user()?.username}
								</span>
								<button
									onClick={handleLogout}
									class="text-sm text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
								>
									Logout
								</button>
							</div>
						</Show>
					</div>
				</Show>
			</header>
			<main class="p-4 sm:p-8">{props.children}</main>
		</div>
	);
};
