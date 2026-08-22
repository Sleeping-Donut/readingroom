import type { ImplementationInfo } from "../../api/settings";

import { IndexerConfigFields } from "./IndexerConfigFields";

export interface IndexerDraft {
	name: string;
	values: Record<string, string | number | boolean>;
	enable_rss: boolean;
	enable_search: boolean;
	priority: number;
}

/// Edit-in-place panel for one indexer: config fields plus Cancel/Save.
export function IndexerEditPanel(props: {
	impl: ImplementationInfo;
	draft: IndexerDraft;
	setDraft: (mutate: (d: IndexerDraft) => void) => void;
	showPriority?: boolean;
	submitting: boolean;
	valid: boolean;
	onCancel: () => void;
	onSave: () => void;
}) {
	return (
		<div class="rounded-lg border border-rule bg-paper-100 p-3">
			<IndexerConfigFields
				impl={props.impl}
				draft={props.draft}
				setDraft={props.setDraft}
				showPriority={props.showPriority ?? false}
			/>
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
