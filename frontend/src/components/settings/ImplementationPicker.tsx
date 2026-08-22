import { For } from "solid-js";

import type { ImplementationInfo } from "../../api/settings";

/// Step 1 of the add wizard: choose which implementation to configure.
export function ImplementationPicker(props: {
	implementations: ImplementationInfo[];
	onPick: (impl: ImplementationInfo) => void;
}) {
	return (
		<>
			<h4 class="mb-3 text-sm font-semibold text-gray-300">Indexer type</h4>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<For each={props.implementations}>
					{(impl) => (
						<button
							onClick={() => props.onPick(impl)}
							class="rounded-lg border border-gray-800 bg-gray-900 p-4 text-left transition-colors hover:border-indigo-600 hover:bg-gray-800"
						>
							<p class="font-medium">{impl.label}</p>
							<p class="mt-1 text-xs text-gray-500">{impl.hint}</p>
						</button>
					)}
				</For>
			</div>
		</>
	);
}
