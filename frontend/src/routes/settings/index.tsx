import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";

import IndexersTab from "../../components/settings/IndexersTab";

export const route = defineFileRoute("/settings", {});

export default function SettingsIndex() {
  return (
    <div>
      <Title>Indexers · Settings · ReadingRoom</Title>
      <IndexersTab />
    </div>
  );
}
