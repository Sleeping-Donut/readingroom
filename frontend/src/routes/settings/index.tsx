import type { RouteProps } from "@solidjs/router";

import { defineFileRoute } from "@solidjs/router/fs";

import SettingsIndexers from "./indexers";

export const route = defineFileRoute("/settings", {
	info: { label: "Indexers" },
});

export default function SettingsIndex(_props: RouteProps<typeof route>) {
	return <SettingsIndexers {...({} as Parameters<typeof SettingsIndexers>[0])} />;
}
