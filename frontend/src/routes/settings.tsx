import { Title } from "@solidjs/meta";
import { createSignal, Match, Switch } from "solid-js";

import AccountTab from "../components/settings/AccountTab";
import DownloadClientsTab from "../components/settings/DownloadClientsTab";
import IndexersTab from "../components/settings/IndexersTab";
import IntegrationsTab from "../components/settings/IntegrationsTab";
import LibraryTab from "../components/settings/LibraryTab";
import NotificationsTab from "../components/settings/NotificationsTab";

export default function Settings() {
  const [activeTab, setActiveTab] = createSignal<
    "library" | "indexers" | "clients" | "notifications" | "account" | "integrations"
  >("indexers");

  return (
    <div>
      <Title>Settings · ReadingRoom</Title>
      <h2 class="text-2xl font-bold mb-6">Settings</h2>

      <div class="flex flex-wrap gap-3 mb-6 border-b border-gray-800 pb-4">
        <button
          onClick={() => setActiveTab("library")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "library",
              "text-gray-400 hover:text-gray-200": activeTab() !== "library",
            },
          ]}
        >
          Library
        </button>
        <button
          onClick={() => setActiveTab("indexers")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "indexers",
              "text-gray-400 hover:text-gray-200": activeTab() !== "indexers",
            },
          ]}
        >
          Indexers
        </button>
        <button
          onClick={() => setActiveTab("clients")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "clients",
              "text-gray-400 hover:text-gray-200": activeTab() !== "clients",
            },
          ]}
        >
          Download Clients
        </button>
        <button
          onClick={() => setActiveTab("notifications")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "notifications",
              "text-gray-400 hover:text-gray-200": activeTab() !== "notifications",
            },
          ]}
        >
          Notifications
        </button>
        <button
          onClick={() => setActiveTab("account")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "account",
              "text-gray-400 hover:text-gray-200": activeTab() !== "account",
            },
          ]}
        >
          Account
        </button>
        <button
          onClick={() => setActiveTab("integrations")}
          class={[
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            {
              "bg-indigo-600 text-white": activeTab() === "integrations",
              "text-gray-400 hover:text-gray-200": activeTab() !== "integrations",
            },
          ]}
        >
          Integrations
        </button>
      </div>

      <Switch>
        <Match when={activeTab() === "library"}>
          <LibraryTab />
        </Match>
        <Match when={activeTab() === "indexers"}>
          <IndexersTab />
        </Match>
        <Match when={activeTab() === "clients"}>
          <DownloadClientsTab />
        </Match>
        <Match when={activeTab() === "notifications"}>
          <NotificationsTab />
        </Match>
        <Match when={activeTab() === "account"}>
          <AccountTab />
        </Match>
        <Match when={activeTab() === "integrations"}>
          <IntegrationsTab />
        </Match>
      </Switch>
    </div>
  );
}
