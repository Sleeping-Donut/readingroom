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
		<div class="mb-4 rounded-lg border border-rule bg-paper-100 p-4">
			<ClientConfigFields draft={props.draft} setDraft={props.setDraft} />
			<div class="mt-4 flex items-center gap-3">
				<button
					onClick={props.onSave}
					disabled={props.submitting || !props.valid}
					class="rounded bg-good px-4 py-2 text-sm transition-colors hover:opacity-90 disabled:opacity-50"
				>
					Save
				</button>
				<button
					onClick={props.onCancel}
					class="rounded bg-paper-200 px-4 py-2 text-sm transition-colors hover:bg-paper-200"
				>
					Cancel
				</button>
				<p class="text-xs text-ink-500">
					{props.draft.implementation === "http"
						? "The download URL is fetched directly."
						: "A host is required to connect."}
				</p>
			</div>
		</div>
	);
}
