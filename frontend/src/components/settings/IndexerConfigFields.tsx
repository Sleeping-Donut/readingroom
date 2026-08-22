import { For, Match, Show, Switch, createUniqueId } from "solid-js";

import type { ImplementationInfo, IndexerParamDef } from "../../api/settings";
import type { Draft } from "../../resources/indexers";

const inputClass = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm";

/// Renders one declared param as the right control for its type. Boolean
/// params nest their checkbox inside the label; other kinds associate via
/// explicit id/htmlFor.
function ParamField(props: {
	p: IndexerParamDef;
	value: string | number | boolean | undefined;
	onValue: (value: string | number | boolean) => void;
	fieldId: string;
}) {
	return (
		<Switch>
			<Match when={props.p.type === "boolean"}>
				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={Boolean(props.value)}
						onChange={(e) => props.onValue(e.currentTarget.checked)}
						class="rounded border-gray-700 bg-gray-800"
					/>
					{props.p.label || props.p.name}
				</label>
			</Match>
			<Match when={props.p.type !== "boolean"}>
				<div>
					<label for={props.fieldId} class="mb-1 block text-xs text-gray-400">
						{props.p.label || props.p.name}
						{props.p.required ? " *" : ""}
					</label>
					<Switch>
						<Match when={props.p.type === "password"}>
							<input
								id={props.fieldId}
								type="password"
								value={String(props.value ?? "")}
								onInput={(e) => props.onValue(e.currentTarget.value)}
								class={inputClass}
								placeholder="Optional"
							/>
						</Match>
						<Match when={props.p.type === "select"}>
							<select
								id={props.fieldId}
								value={String(props.value ?? "")}
								onChange={(e) => props.onValue(e.currentTarget.value)}
								class={inputClass}
							>
								<For each={props.p.options}>
									{(opt) => <option value={opt}>{opt}</option>}
								</For>
							</select>
						</Match>
						<Match when={true}>
							<input
								id={props.fieldId}
								type="text"
								value={String(props.value ?? "")}
								onInput={(e) => props.onValue(e.currentTarget.value)}
								class={inputClass}
							/>
						</Match>
					</Switch>
				</div>
			</Match>
		</Switch>
	);
}

/// One data-driven config form for every implementation: common fields plus a
/// generated field per declared param, toggles gated by declared capabilities.
/// Ids are instance-scoped because the add wizard and an edit panel can mount
/// alongside each other.
export function IndexerConfigFields(props: {
	impl: ImplementationInfo;
	draft: Draft;
	setDraft: (mutate: (d: Draft) => void) => void;
	showPriority: boolean;
}) {
	const uid = createUniqueId();
	return (
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div>
				<label for={`${uid}-indexer-name`} class="mb-1 block text-xs text-gray-400">
					Name
				</label>
				<input
					id={`${uid}-indexer-name`}
					value={props.draft.name}
					onInput={(e) =>
						props.setDraft((d) => {
							d.name = e.currentTarget.value;
						})
					}
					class={inputClass}
					placeholder="My Indexer"
				/>
			</div>
			<div>
				<span class="mb-1 block text-xs text-gray-400">Type</span>
				<p class="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300">
					{props.impl.label}
				</p>
				<p class="mt-1 text-xs text-gray-500">{props.impl.hint}</p>
			</div>
			<For each={props.impl.params}>
				{(p) => (
					<ParamField
						p={p}
						value={props.draft.values[p.name]}
						onValue={(value) =>
							props.setDraft((d) => {
								d.values[p.name] = value;
							})
						}
						fieldId={`${uid}-indexer-param-${p.name}`}
					/>
				)}
			</For>
			<Show when={props.showPriority}>
				<div>
					<label for={`${uid}-indexer-priority`} class="mb-1 block text-xs text-gray-400">
						Priority
					</label>
					<input
						id={`${uid}-indexer-priority`}
						type="number"
						value={props.draft.priority}
						onInput={(e) =>
							props.setDraft((d) => {
								d.priority = Number(e.currentTarget.value);
							})
						}
						class={inputClass}
					/>
				</div>
			</Show>
			<div class="flex items-end gap-6 sm:col-span-2">
				<Show when={props.impl.supports_rss}>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={props.draft.enable_rss}
							onChange={(e) =>
								props.setDraft((d) => {
									d.enable_rss = e.currentTarget.checked;
								})
							}
							class="rounded border-gray-700 bg-gray-800"
						/>
						Enable RSS
					</label>
				</Show>
				<Show when={props.impl.supports_search}>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={props.draft.enable_search}
							onChange={(e) =>
								props.setDraft((d) => {
									d.enable_search = e.currentTarget.checked;
								})
							}
							class="rounded border-gray-700 bg-gray-800"
						/>
						Enable Search
					</label>
				</Show>
			</div>
		</div>
	);
}
