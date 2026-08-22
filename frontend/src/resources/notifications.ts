import { action, createOptimisticStore, createProjection, refresh } from "solid-js";
import * as v from "valibot";

import * as settingsApi from "../api/settings";

type ServerNotification = Awaited<
  ReturnType<typeof settingsApi.listNotifications>
>["notifications"][number];

export type RowError = { op: "add" | "remove"; args: unknown[] };

// Wire row minus server-only metadata the optimistic temp row can't provide,
// plus the optimistic in-flight flag (written during actions, reverted on
// settle — also set while a test is running).
type StoredNotification = Omit<ServerNotification, "created_at"> & {
  pending?: boolean;
};

// Projected row: stored fields + client affordances layered by the projection.
export type NotificationRow = StoredNotification & {
  error?: RowError;
};

// --- settings parsing ---------------------------------------------------------

export interface NotificationSettings {
  webhook_url?: string;
}

const NOTIFICATION_SETTINGS_SCHEMA = v.object({
  webhook_url: v.optional(v.string()),
});

/// Parse a row's stored settings JSON into a typed shape.
export function parseNotificationSettings(settings: string): NotificationSettings {
  const parsed = v.safeParse(
    NOTIFICATION_SETTINGS_SCHEMA,
    (() => {
      try {
        return JSON.parse(settings);
      } catch {
        return null;
      }
    })(),
  );
  return parsed.success ? parsed.output : {};
}

// --- drafts -----------------------------------------------------------------

export interface Draft {
  name: string;
  implementation: string;
  webhook_url: string;
  on_grab: boolean;
  on_import: boolean;
  on_upgrade: boolean;
  on_health_issue: boolean;
}

export function draftFor(): Draft {
  return {
    name: "",
    implementation: "apprise",
    webhook_url: "",
    on_grab: true,
    on_import: true,
    on_upgrade: true,
    on_health_issue: true,
  };
}

/// Convert a draft into the API input shape for add calls.
export function toInput(draft: Draft): settingsApi.NotificationInput {
  return {
    name: draft.name.trim(),
    implementation: draft.implementation,
    webhook_url: draft.webhook_url.trim(),
    on_grab: draft.on_grab,
    on_import: draft.on_import,
    on_upgrade: draft.on_upgrade,
    on_health_issue: draft.on_health_issue,
  };
}

export function validateDraft(draft: Draft) {
  if (!draft.name.trim()) {
    return { success: false as const, error: "Name is required" };
  }
  return { success: true as const };
}

/// Server state + mutations for the notifications settings page. Returns the
/// projected list (server rows with pending/error affordances layered on)
/// plus the actions; the route holds no other server state.
export function createNotifications() {
  // Failed-persist bookkeeping — scoped to this factory, touched only by the
  // actions, layered back onto rows by the projection.
  const rowErrors = new Map<number, RowError>();

  // Authoritative server rows (+optimistic overlay during actions).
  const [serverRows, setServerRows] = createOptimisticStore<{
    notifications: StoredNotification[];
  }>(
    async () => {
      const data = await settingsApi.listNotifications();
      return { notifications: data.notifications };
    },
    { notifications: [] },
  );

  // Projected view: server rows with affordances layered per row.
  const notifications = createProjection(
    () => ({
      notifications: serverRows.notifications.map((row) => ({
        ...row,
        error: rowErrors.get(row.id),
      })),
    }),
    { notifications: [] },
  );

  const removeNotification = action(function* (row: NotificationRow) {
    setServerRows((s) => {
      s.notifications = s.notifications.filter((n) => n.id !== row.id);
    });
    try {
      yield settingsApi.removeNotification(row.id);
      rowErrors.delete(row.id);
    } catch {
      rowErrors.set(row.id, { op: "remove", args: [row] });
    }
    refresh(serverRows);
  });

  const retryRemoveNotification = action(function* (id: number) {
    setServerRows((s) => {
      const r = s.notifications.find((n) => n.id === id);
      if (r) r.pending = true;
    });
    try {
      yield settingsApi.removeNotification(id);
      rowErrors.delete(id);
    } catch {
      /* row keeps its retry affordance */
    }
    refresh(serverRows);
  });

  const addNotification = action(function* (input: settingsApi.NotificationInput) {
    const tempId = -Date.now();
    setServerRows((s) => {
      s.notifications.push({
        id: tempId,
        name: input.name,
        implementation: input.implementation,
        settings: JSON.stringify({ webhook_url: input.webhook_url }),
        on_grab: input.on_grab,
        on_import: input.on_import,
        on_upgrade: input.on_upgrade,
        on_health_issue: input.on_health_issue,
        pending: true,
      });
    });
    yield settingsApi.addNotification(input);
    refresh(serverRows);
  });

  /// Optimistic test marker; the pending flag doubles as the busy affordance.
  const testNotification = action(function* (id: number) {
    setServerRows((s) => {
      const r = s.notifications.find((n) => n.id === id);
      if (r) r.pending = true;
    });
    try {
      yield settingsApi.testNotification(id);
    } finally {
      refresh(serverRows);
    }
  });

  return [
    notifications,
    { addNotification, removeNotification, retryRemoveNotification, testNotification },
  ] as const;
}
