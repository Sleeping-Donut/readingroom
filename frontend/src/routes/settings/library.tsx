import { Title } from "@solidjs/meta";
import { defineFileRoute } from "@solidjs/router/fs";

import LibraryTab from "../../components/settings/LibraryTab";

export const route = defineFileRoute("/settings/library", {});

export default function SettingsLibrary() {
  return (
    <div>
      <Title>Library · Settings · ReadingRoom</Title>
      <LibraryTab />
    </div>
  );
}
