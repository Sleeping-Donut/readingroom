import { createSignal, Match, Switch } from "solid-js";
import { Title } from "@solidjs/meta";
import IndexersTab from "../components/settings/IndexersTab";
import DownloadClientsTab from "../components/settings/DownloadClientsTab";
import NotificationsTab from "../components/settings/NotificationsTab";
import AccountTab from "../components/settings/AccountTab";

export default function Settings() {
  const [activeTab, setActiveTab] = createSignal<
    "indexers" | "clients" | "notifications" | "account"
  >("indexers");

  return (
    <div>
      <Title>Settings · ReadingRoom</Title>
      <h2 class="text-2xl font-bold mb-6">Settings</h2>

      <div class="flex gap-4 mb-6 border-b border-gray-800 pb-4">
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
      </div>

      <Switch>
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
      </Switch>
    </div>
  );
}
