import { createEffect, createSignal, type Accessor, type Setter } from "solid-js";

export type ViewMode = "grid" | "list";

const PREFIX = "readingroom.view.";

export function createViewPreference(key: string): [Accessor<ViewMode>, Setter<ViewMode>] {
  const stored =
    typeof window !== "undefined" ? (localStorage.getItem(PREFIX + key) as ViewMode) : null;
  const [view, setView] = createSignal<ViewMode>(stored === "list" ? "list" : "grid");

  createEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(PREFIX + key, view());
      } catch {
        /* ignore */
      }
    }
  });

  return [view, setView];
}

export function ViewToggle(props: { view: ViewMode; onChange: (view: ViewMode) => void }) {
  const button = (mode: ViewMode, label: string) => (
    <button
      onClick={() => props.onChange(mode)}
      class={[
        "px-2.5 py-1.5 rounded text-xs font-medium transition-colors",
        props.view === mode
          ? "bg-indigo-600 text-white"
          : "bg-gray-800 text-gray-400 hover:text-gray-200",
      ]}
    >
      {label}
    </button>
  );

  return (
    <div class="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
      {button("grid", "Grid")}
      {button("list", "List")}
    </div>
  );
}
