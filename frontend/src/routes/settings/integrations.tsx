import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";

import IntegrationsTab from "../../components/settings/IntegrationsTab";

export const route = defineFileRoute("/settings/integrations", {});

export default function SettingsIntegrations() {
  return (
    <div>
      <Title>Integrations · Settings · ReadingRoom</Title>
      <IntegrationsTab />
    </div>
  );
}
