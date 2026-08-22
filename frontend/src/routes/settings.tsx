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
		<div>
			<Title>Settings · ReadingRoom</Title>
			<h2 class="text-2xl font-bold mb-6">Settings</h2>

			<div class="gap-3 mb-6 border-gray-800 pb-4 flex flex-wrap border-b">
				<For each={TABS}>
					{(tab) => {
						const isActive = () => activeSlug() === tab.slug;
						const label = isActive() ? (activeLabel() ?? tab.label) : tab.label;
						return (
							<a
								href={tab.href()}
								aria-current={isActive() ? "page" : undefined}
								class={[
									"px-4 py-2 rounded-lg text-sm font-medium transition-colors",
									isActive()
										? "bg-indigo-600 text-white"
										: "text-gray-400 hover:text-gray-200",
								]}
							>
								{label}
							</a>
						);
					}}
				</For>
			</div>

			{props.children}
		</div>
	);
}
