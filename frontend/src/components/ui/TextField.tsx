import { TextField as KTextField } from "@kobalte/core/text-field";
import { omit, type Element, Show } from "solid-js";

const inputClass =
	"w-full rounded-sm border border-rule bg-paper-200 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none invalid:border-bad";

interface TextFieldProps {
	label?: string;
	placeholder?: string;
	type?: string;
	value?: string;
	onInput?: (value: string) => void;
	description?: string;
	error?: string;
	name?: string;
	required?: boolean;
	autocomplete?: string;
	class?: string;
	children?: Element;
}

/// Paper-well text input with associated label and error slot. Controlled:
/// pass `value` + `onInput(value)`.
export function TextField(props: TextFieldProps) {
	const rest = omit(props, "label", "error", "description", "class", "onInput");
	return (
		<KTextField
			{...(rest as any)}
			validationState={props.error ? ("invalid" as const) : undefined}
			onChange={(v: string) => props.onInput?.(v)}
			class={`flex flex-col gap-1${props.class ? ` ${props.class}` : ""}`}
		>
			<Show when={props.label}>
				<KTextField.Label class="font-meta text-xs tracking-widest text-ink-500 uppercase">
					{props.label}
				</KTextField.Label>
			</Show>
			<KTextField.Input
				class={inputClass}
				placeholder={props.placeholder}
				type={props.type}
			/>
			<Show when={props.description}>
				<KTextField.Description class="text-xs text-ink-500">
					{props.description}
				</KTextField.Description>
			</Show>
			<KTextField.ErrorMessage class="text-xs text-bad">
				{props.error}
			</KTextField.ErrorMessage>
		</KTextField>
	);
}

export default TextField;
