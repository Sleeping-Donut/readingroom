import type { Draft } from "../../../resources/clients";

import ClientConfigFields from "./ClientConfigFields";

/// Add-flow panel: shared config fields plus save/cancel and an
/// implementation-specific connection hint.
export function AddClientForm(props: {
	draft: Draft;
	setDraft: (mutate: (d: Draft) => void) => void;
	submitting: boolean;
	valid: boolean;
	onSave: () => void;
	onCancel: () => void;
}) {
	return (
		<div class="mb-4 p-4 bg-gray-900 rounded-lg border-gray-800 border">
			<ClientConfigFields draft={props.draft} setDraft={props.setDraft} />
			<div class="gap-3 mt-4 flex items-center">
				<button
					onClick={props.onSave}
					disabled={props.submitting || !props.valid}
					class="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 rounded text-sm transition-colors"
				>
					Save
				</button>
				<button
					onClick={props.onCancel}
					class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
				>
					Cancel
				</button>
				<p class="text-xs text-gray-500">
					{props.draft.implementation === "http"
						? "The download URL is fetched directly."
						: "A host is required to connect."}
				</p>
			</div>
		</div>
	);
}
