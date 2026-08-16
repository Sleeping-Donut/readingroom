import { Title } from "@solidjs/meta";
import { type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import {
  action,
  createMemo,
  createOptimisticStore,
  createSignal,
  Errored,
  For,
  Loading,
  refresh,
  Show,
} from "solid-js";
import * as v from "valibot";

import type { Notification } from "../../types";

import * as settingsApi from "../../api/settings";

export const route = defineFileRoute("/settings/notifications", {
  info: { label: "Notifications" },
});

const NOTIFICATION_SETTINGS_SCHEMA = v.object({
  webhook_url: v.optional(v.string()),
});

export default function NotificationsTab(_props: RouteProps<typeof route>) {
  const [showAdd, setShowAdd] = createSignal(false);
  const [adding, setAdding] = createSignal(false);
  const [testingId, setTestingId] = createSignal<number | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [newName, setNewName] = createSignal("");
  const [newImpl, setNewImpl] = createSignal("apprise");
  const [newWebhookUrl, setNewWebhookUrl] = createSignal("");
  const [newOnGrab, setNewOnGrab] = createSignal(true);
  const [newOnImport, setNewOnImport] = createSignal(true);
  const [newOnUpgrade, setNewOnUpgrade] = createSignal(true);
  const [newOnHealthIssue, setNewOnHealthIssue] = createSignal(true);

  const erroredNotifications: Record<number, Notification> = {};

  const [notifications, setNotifications] = createOptimisticStore<{
    notifications: (Notification & { error?: boolean })[];
  }>(
    async () => {
      const data = await settingsApi.listNotifications();
      return {
        notifications: data.notifications.map((n) =>
          erroredNotifications[n.id] ? { ...n, error: true } : n,
        ),
      };
    },
    { notifications: [] },
  );

  const removeNotification = action(function* (notif: Notification) {
    setNotifications((s) => {
      s.notifications = s.notifications.filter((n) => n.id !== notif.id);
    });
    try {
      yield settingsApi.removeNotification(notif.id);
      delete erroredNotifications[notif.id];
    } catch {
      erroredNotifications[notif.id] = notif;
    }
    refresh(notifications);
  });

  const [retryingNotificationId, setRetryingNotificationId] = createSignal<number | null>(null);

  const retryRemoveNotification = action(function* (notif: Notification) {
    setRetryingNotificationId(notif.id);
    try {
      yield settingsApi.removeNotification(notif.id);
      delete erroredNotifications[notif.id];
    } catch {
      /* leave errored */
    } finally {
      setRetryingNotificationId(null);
    }
    refresh(notifications);
  });

  const addNotification = action(async function* () {
    setAdding(true);
    try {
      await settingsApi.addNotification({
        name: newName(),
        implementation: newImpl(),
        webhook_url: newWebhookUrl(),
        on_grab: newOnGrab(),
        on_import: newOnImport(),
        on_upgrade: newOnUpgrade(),
        on_health_issue: newOnHealthIssue(),
      });
      yield;
      refresh(notifications);
      setShowAdd(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAdding(false);
    }
  });

  const testNotification = action(async function* (id: number) {
    setTestingId(id);
    try {
      await settingsApi.testNotification(id);
      yield;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setTestingId(null);
    }
  });

  return (
    <div>
      <Title>Notifications · Settings · ReadingRoom</Title>
      <Errored
        fallback={(err, reset) => (
          <p class="text-sm text-red-400 mt-2">
            Failed to load: {String(err())}{" "}
            <button onClick={reset} class="text-indigo-400 underline ml-1">
              Retry
            </button>
          </p>
        )}
      >
        <Loading fallback={<p class="text-gray-500">Loading...</p>}>
          <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 class="text-lg font-semibold">Notifications</h3>
            <button
              onClick={() => setShowAdd(!showAdd())}
              class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm transition-colors"
            >
              {showAdd() ? "Cancel" : "Add Notification"}
            </button>
          </div>

          <Show when={actionError()}>
            <p class="text-sm text-red-400 mt-2">{actionError()}</p>
          </Show>

          <Show when={showAdd()}>
            <div class="mb-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
              <div class="flex flex-col gap-3">
                <div class="flex gap-3 items-end">
                  <div class="flex-1">
                    <label class="block text-xs text-gray-400 mb-1">Name</label>
                    <input
                      value={newName()}
                      onInput={(e) => setNewName(e.currentTarget.value)}
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                      placeholder="My Notification"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-gray-400 mb-1">Implementation</label>
                    <select
                      value={newImpl()}
                      onChange={(e) => setNewImpl(e.currentTarget.value)}
                      class="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    >
                      <option value="apprise">Apprise</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Webhook URL</label>
                  <input
                    value={newWebhookUrl()}
                    onInput={(e) => setNewWebhookUrl(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm"
                    placeholder="https://hooks.example.com/..."
                  />
                </div>
                <div class="flex gap-6 items-center">
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newOnGrab()}
                      onChange={(e) => setNewOnGrab(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    On Grab
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newOnImport()}
                      onChange={(e) => setNewOnImport(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    On Import
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newOnUpgrade()}
                      onChange={(e) => setNewOnUpgrade(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    On Upgrade
                  </label>
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newOnHealthIssue()}
                      onChange={(e) => setNewOnHealthIssue(e.currentTarget.checked)}
                      class="rounded bg-gray-800 border-gray-700"
                    />
                    On Health Issue
                  </label>
                  <button
                    onClick={() => void addNotification()}
                    disabled={adding() || !newName()}
                    class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </Show>

          <Show
            when={notifications.notifications.length > 0}
            fallback={<p class="text-gray-500 text-sm">No notifications configured.</p>}
          >
            <div class="space-y-2">
              <For each={notifications.notifications}>
                {(notif) => (
                  <NotificationItem
                    notif={notif}
                    testNotification={(id) => void testNotification(id)}
                    deleteNotification={(notif) => void removeNotification(notif)}
                    retryNotification={(notif) => void retryRemoveNotification(notif)}
                    testing={testingId() === notif.id}
                    retrying={retryingNotificationId() === notif.id}
                  />
                )}
              </For>
            </div>
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}

function NotificationItem(props: {
  notif: Notification & { error?: boolean };
  testNotification: (id: number) => void;
  deleteNotification: (notif: Notification) => void;
  retryNotification: (notif: Notification) => void;
  testing: boolean;
  retrying: boolean;
}) {
  const parsedSettings = createMemo(() => {
    const parsed = v.safeParse(
      NOTIFICATION_SETTINGS_SCHEMA,
      (() => {
        try {
          return JSON.parse(props.notif.settings);
        } catch {
          return null;
        }
      })(),
    );
    return parsed.success ? parsed.output : {};
  });

  return (
    <div
      class={[
        "flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-900 rounded-lg border transition-colors",
        { "border-red-800": !!props.notif.error, "border-gray-800": !props.notif.error },
      ]}
    >
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">{props.notif.name}</p>
        <p class="text-xs text-gray-400">
          {props.notif.implementation}
          <Show when={parsedSettings().webhook_url}>
            {" \u00b7 "}
            {parsedSettings().webhook_url}
          </Show>
        </p>
        <div class="flex gap-3 mt-1 text-xs">
          <span
            class={[
              "text-xs",
              { "text-green-400": props.notif.on_grab, "text-gray-600": !props.notif.on_grab },
            ]}
          >
            {props.notif.on_grab ? "\u2713" : "\u2717"} Grab
          </span>
          <span
            class={[
              "text-xs",
              { "text-green-400": props.notif.on_import, "text-gray-600": !props.notif.on_import },
            ]}
          >
            {props.notif.on_import ? "\u2713" : "\u2717"} Import
          </span>
          <span
            class={[
              "text-xs",
              {
                "text-green-400": props.notif.on_upgrade,
                "text-gray-600": !props.notif.on_upgrade,
              },
            ]}
          >
            {props.notif.on_upgrade ? "\u2713" : "\u2717"} Upgrade
          </span>
          <span
            class={[
              "text-xs",
              {
                "text-green-400": props.notif.on_health_issue,
                "text-gray-600": !props.notif.on_health_issue,
              },
            ]}
          >
            {props.notif.on_health_issue ? "\u2713" : "\u2717"} Health
          </span>
        </div>
        <Show when={props.notif.error}>
          <p class="text-xs text-red-400 mt-1">Failed to remove — click Retry</p>
        </Show>
      </div>
      <div class="flex flex-wrap gap-2 shrink-0">
        <button
          onClick={() => props.testNotification(props.notif.id)}
          disabled={props.testing}
          class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors"
        >
          Test
        </button>
        <Show
          when={props.notif.error}
          fallback={
            <button
              onClick={() => props.deleteNotification(props.notif)}
              class="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
            >
              Remove
            </button>
          }
        >
          <button
            onClick={() => props.retryNotification(props.notif)}
            disabled={props.retrying}
            class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-xs transition-colors disabled:bg-gray-700"
          >
            {props.retrying ? "Retrying..." : "Retry"}
          </button>
        </Show>
      </div>
    </div>
  );
}
