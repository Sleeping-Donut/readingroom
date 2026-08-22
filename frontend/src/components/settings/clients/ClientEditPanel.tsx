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
		<div class="rounded-lg border border-rule bg-paper-100 p-3">
			<ClientConfigFields draft={props.draft} setDraft={props.setDraft} />
			<div class="mt-3 flex justify-end gap-2">
				<button
					onClick={props.onCancel}
					class="rounded bg-paper-200 px-3 py-1.5 text-sm transition-colors hover:bg-paper-200"
				>
					Cancel
				</button>
				<button
					onClick={props.onSave}
					disabled={props.submitting || !props.valid}
					class="rounded bg-good px-3 py-1.5 text-sm text-paper-50 transition-colors hover:opacity-90 disabled:opacity-50"
				>
					Save
				</button>
			</div>
		</div>
	);
}
