import { For, Show, Switch, Match } from "solid-js";

import type { ImplementationInfo, IndexerParamDef } from "../../api/settings";
import type { Draft } from "../../resources/indexers";

const inputClass = "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm";

/// Renders one declared param as the right control for its type.
function ParamField(props: {
	p: IndexerParamDef;
	value: string | number | boolean | undefined;
	onValue: (value: string | number | boolean) => void;
}) {
	return (
		<Switch>
			<Match when={props.p.type === "boolean"}>
				<label class="gap-2 text-sm flex items-center">
					<input
						type="checkbox"
						checked={Boolean(props.value)}
						onChange={(e) => props.onValue(e.currentTarget.checked)}
						class="rounded bg-gray-800 border-gray-700"
					/>
					{props.p.label || props.p.name}
				</label>
			</Match>
			<Match when={props.p.type !== "boolean"}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">
						{props.p.label || props.p.name}
						{props.p.required ? " *" : ""}
					</label>
					<Switch>
						<Match when={props.p.type === "password"}>
							<input
								type="password"
								value={String(props.value ?? "")}
								onInput={(e) => props.onValue(e.currentTarget.value)}
								class={inputClass}
								placeholder="Optional"
							/>
						</Match>
						<Match when={props.p.type === "select"}>
							<select
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
export function IndexerConfigFields(props: {
	impl: ImplementationInfo;
	draft: Draft;
	setDraft: (mutate: (d: Draft) => void) => void;
	showPriority: boolean;
}) {
	return (
		<div class="sm:grid-cols-2 gap-3 grid grid-cols-1">
			<div>
				<label class="text-xs text-gray-400 mb-1 block">Name</label>
				<input
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
				<label class="text-xs text-gray-400 mb-1 block">Type</label>
				<p class="px-3 py-2 bg-gray-800 border-gray-700 rounded text-sm text-gray-300 border">
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
					/>
				)}
			</For>
			<Show when={props.showPriority}>
				<div>
					<label class="text-xs text-gray-400 mb-1 block">Priority</label>
					<input
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
			<div class="sm:col-span-2 gap-6 flex items-end">
				<Show when={props.impl.supports_rss}>
					<label class="gap-2 text-sm flex items-center">
						<input
							type="checkbox"
							checked={props.draft.enable_rss}
							onChange={(e) =>
								props.setDraft((d) => {
									d.enable_rss = e.currentTarget.checked;
								})
							}
							class="rounded bg-gray-800 border-gray-700"
						/>
						Enable RSS
					</label>
				</Show>
				<Show when={props.impl.supports_search}>
					<label class="gap-2 text-sm flex items-center">
						<input
							type="checkbox"
							checked={props.draft.enable_search}
							onChange={(e) =>
								props.setDraft((d) => {
									d.enable_search = e.currentTarget.checked;
								})
							}
							class="rounded bg-gray-800 border-gray-700"
						/>
						Enable Search
					</label>
				</Show>
			</div>
		</div>
	);
}
