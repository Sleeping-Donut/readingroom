import { Title } from "@solidjs/meta";
import { useLocation } from "@solidjs/router";
import { For, type ParentProps } from "solid-js";

import { paths } from "../router";

const TABS = [
  { slug: "library", label: "Library", href: () => paths.settings.library() },
  { slug: "indexers", label: "Indexers", href: () => paths.settings.indexers() },
  { slug: "clients", label: "Download Clients", href: () => paths.settings.clients() },
  { slug: "notifications", label: "Notifications", href: () => paths.settings.notifications() },
  { slug: "account", label: "Account", href: () => paths.settings.account() },
  { slug: "integrations", label: "Integrations", href: () => paths.settings.integrations() },
];

export default function SettingsLayout(props: ParentProps) {
  const location = useLocation();

  const isActive = (slug: string) =>
    location.pathname === `/settings/${slug}` ||
    (location.pathname === "/settings" && slug === "indexers");

  return (
    <div>
      <Title>Settings · ReadingRoom</Title>
      <h2 class="text-2xl font-bold mb-6">Settings</h2>

      <div class="flex flex-wrap gap-3 mb-6 border-b border-gray-800 pb-4">
        <For each={TABS}>
          {(tab) => (
            <a
              href={tab.href()}
              class={[
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive(tab.slug)
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200",
              ]}
            >
              {tab.label}
            </a>
          )}
        </For>
      </div>

      {props.children}
    </div>
  );
}
