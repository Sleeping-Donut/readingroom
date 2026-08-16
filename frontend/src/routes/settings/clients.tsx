import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";

import DownloadClientsTab from "../../components/settings/DownloadClientsTab";

export const route = defineFileRoute("/settings/clients", {});

export default function SettingsClients() {
  return (
    <div>
      <Title>Download Clients · Settings · ReadingRoom</Title>
      <DownloadClientsTab />
    </div>
  );
}
