import { Title } from "@solidjs/meta";
import { useRouteMatches, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { For } from "solid-js";

import { paths } from "../router";

export const route = defineFileRoute("/settings", {});

const TABS = [
	{ slug: "library", label: "Library", href: () => paths.settings.library() },
	{ slug: "indexers", label: "Indexers", href: () => paths.settings.indexers() },
	{ slug: "clients", label: "Download Clients", href: () => paths.settings.clients() },
	{ slug: "notifications", label: "Notifications", href: () => paths.settings.notifications() },
	{ slug: "account", label: "Account", href: () => paths.settings.account() },
	{ slug: "integrations", label: "Integrations", href: () => paths.settings.integrations() },
	{ slug: "metadata", label: "Metadata", href: () => paths.settings.metadata() },
];

export default function SettingsLayout(props: RouteProps<typeof route>) {
	const matches = useRouteMatches();

	const activeSlug = () => {
		const chain = matches();
		const path = chain[chain.length - 1]?.route.originalPath ?? "";
		// The /settings index leaf (renders Indexers) has path "/" in the manifest.
		if (path === "/" || path === "" || path === "/settings" || path === "/settings/") {
			return "indexers";
		}
		return path.replace(/^\/settings\//, "");
	};

	const activeLabel = () => matches()[matches().length - 1]?.route.info?.label;

	return (
		<div class="lg:grid lg:grid-cols-[14rem_1fr] lg:gap-12">
			<Title>Settings · ReadingRoom</Title>
			<header class="mb-8">
				<p class="font-meta text-xs tracking-widest text-ink-500 uppercase">
					The Fine Print
				</p>
				<h2 class="font-display text-4xl text-ink-900">Settings</h2>

				<nav
					class="mt-6 flex flex-wrap gap-x-6 gap-y-2 lg:flex-col lg:gap-3"
					aria-label="Settings sections"
				>
					<For each={TABS}>
						{(tab, i) => {
							const isActive = () => activeSlug() === tab.slug;
							const label = isActive() ? (activeLabel() ?? tab.label) : tab.label;
							return (
								<a
									href={tab.href()}
									aria-current={isActive() ? "page" : undefined}
									class={[
										"border-b-2 pb-1 font-meta text-xs tracking-widest uppercase transition-colors",
										isActive()
											? "border-ink-900 text-ink-900"
											: "border-transparent text-ink-500 hover:text-ink-900",
									]}
								>
									<span class="mr-2 text-accent" aria-hidden="true">
										{String(i() + 1).padStart(2, "0")}
									</span>
									{label}
								</a>
							);
						}}
					</For>
				</nav>
			</header>

			<div>{props.children}</div>
		</div>
	);
}
