import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";

import NotificationsTab from "../../components/settings/NotificationsTab";

export const route = defineFileRoute("/settings/notifications", {});

export default function SettingsNotifications() {
  return (
    <div>
      <Title>Notifications · Settings · ReadingRoom</Title>
      <NotificationsTab />
    </div>
  );
}
