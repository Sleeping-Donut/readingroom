import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";

import AccountTab from "../../components/settings/AccountTab";

export const route = defineFileRoute("/settings/account", {});

export default function SettingsAccount() {
  return (
    <div>
      <Title>Account · Settings · ReadingRoom</Title>
      <AccountTab />
    </div>
  );
}
