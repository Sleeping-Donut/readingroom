import { Button as KButton } from "@kobalte/core/button";
import { cva, type VariantProps } from "class-variance-authority";
import { omit, type Element as SolidElement } from "solid-js";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 rounded-sm text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				solid: "bg-ink-900 px-4 py-2 font-medium text-paper-50 hover:bg-ink-700",
				outline:
					"border border-ink-900 bg-transparent px-4 py-2 text-ink-900 hover:bg-paper-200",
				ghost: "px-2 py-1 font-meta text-xs tracking-widest uppercase text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline disabled:text-ink-500",
			},
		},
		defaultVariants: { variant: "solid" },
	},
);

interface ButtonProps extends VariantProps<typeof buttonVariants> {
	class?: string;
	children?: SolidElement;
	onClick?: (event: MouseEvent) => void;
	disabled?: boolean;
	type?: "button" | "submit";
	title?: string;
}

export function Button(props: ButtonProps) {
	const rest = omit(props, "variant");
	const classes = `${buttonVariants({ variant: props.variant })}${props.class ? ` ${props.class}` : ""}`;
	return (
		<KButton {...(rest as any)} class={classes}>
			{props.children}
		</KButton>
	);
}

export default Button;
