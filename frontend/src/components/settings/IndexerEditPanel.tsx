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
    <div class="p-3 bg-gray-900 rounded-lg border border-gray-800">
      <IndexerConfigFields
        impl={props.impl}
        draft={props.draft}
        setDraft={props.setDraft}
        showPriority={props.showPriority ?? false}
      />
      <div class="flex gap-2 mt-3 justify-end">
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
