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
		<div class="rounded-lg border border-gray-800 bg-gray-900 p-3">
			<IndexerConfigFields
				impl={props.impl}
				draft={props.draft}
				setDraft={props.setDraft}
				showPriority={props.showPriority ?? false}
			/>
			<div class="mt-3 flex justify-end gap-2">
				<button
					onClick={props.onCancel}
					class="rounded bg-gray-700 px-3 py-1.5 text-sm transition-colors hover:bg-gray-600"
				>
					Cancel
				</button>
				<button
					onClick={props.onSave}
					disabled={props.submitting || !props.valid}
					class="rounded bg-green-700 px-3 py-1.5 text-sm transition-colors hover:bg-green-600 disabled:bg-gray-600"
				>
					Save
				</button>
			</div>
		</div>
	);
}
