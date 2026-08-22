import type { Draft } from "../../../resources/clients";

import ClientConfigFields from "./ClientConfigFields";

/// Edit-in-place panel for one download client.
export function ClientEditPanel(props: {
	draft: Draft;
	setDraft: (mutate: (d: Draft) => void) => void;
	submitting: boolean;
	valid: boolean;
	onCancel: () => void;
	onSave: () => void;
}) {
	return (
		<div class="p-3 bg-gray-900 rounded-lg border-gray-800 border">
			<ClientConfigFields draft={props.draft} setDraft={props.setDraft} />
			<div class="gap-2 mt-3 flex justify-end">
				<button
					onClick={props.onCancel}
					class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
				>
					Cancel
				</button>
				<button
					onClick={props.onSave}
					disabled={props.submitting || !props.valid}
					class="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
				>
					Save
				</button>
			</div>
		</div>
	);
}
