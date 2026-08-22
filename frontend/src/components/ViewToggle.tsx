import { createSignal, type Accessor, type Setter } from "solid-js";

export type ViewMode = "grid" | "list";

const PREFIX = "readingroom.view.";

function readStored(key: string): ViewMode | null {
	if (typeof localStorage === "undefined") return null;
	try {
		return localStorage.getItem(PREFIX + key) as ViewMode;
	} catch {
		return null;
	}
}

function writeStored(key: string, view: ViewMode) {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(PREFIX + key, view);
	} catch {
		/* ignore */
	}
}

export function createViewPreference(key: string): [Accessor<ViewMode>, Setter<ViewMode>] {
	const [view, setView] = createSignal<ViewMode>(readStored(key) === "list" ? "list" : "grid");

	const setViewPersisted: Setter<ViewMode> = (value) => {
		const next =
			typeof value === "function" ? (value as (prev: ViewMode) => ViewMode)(view()) : value;
		writeStored(key, next);
		return setView(next);
	};

	return [view, setViewPersisted];
}

export function ViewToggle(props: { view: ViewMode; onChange: (view: ViewMode) => void }) {
	const button = (mode: ViewMode, label: string) => (
		<button
			onClick={() => props.onChange(mode)}
			class={[
				"rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
				props.view === mode
					? "bg-ink-900 text-paper-50"
					: "bg-transparent text-ink-500 hover:text-ink-900",
			]}
		>
			{label}
		</button>
	);

	return (
		<div class="flex gap-1 rounded-sm border border-rule bg-paper-100 p-1">
			{button("grid", "Grid")}
			{button("list", "List")}
		</div>
	);
}
