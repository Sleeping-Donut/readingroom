import { For } from "solid-js";

import type { ImplementationInfo } from "../../api/settings";

/// Step 1 of the add wizard: choose which implementation to configure.
export function ImplementationPicker(props: {
  implementations: ImplementationInfo[];
  onPick: (impl: ImplementationInfo) => void;
}) {
  return (
    <>
      <h4 class="text-sm font-semibold text-gray-300 mb-3">Indexer type</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <For each={props.implementations}>
          {(impl) => (
            <button
              onClick={() => props.onPick(impl)}
              class="p-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-indigo-600 rounded-lg text-left transition-colors"
            >
              <p class="font-medium">{impl.label}</p>
              <p class="text-xs text-gray-500 mt-1">{impl.hint}</p>
            </button>
          )}
        </For>
      </div>
    </>
  );
}
