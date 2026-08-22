import { Show } from "solid-js";

export function BookCover(props: {
	src?: string;
	alt: string;
	class?: string;
	emojiClass?: string;
}) {
	const fit = () =>
		props.class?.match(/\bobject-(cover|contain|fill|none|scale-down)\b/) ? "" : "object-cover";

	return (
		<Show
			when={props.src}
			fallback={
				<div
					class={[
						"flex items-center justify-center border border-rule bg-paper-200",
						props.class,
					]}
				>
					<span class={["text-ink-500", props.emojiClass ?? ""]}>📖</span>
				</div>
			}
		>
			{(img) => (
				<img
					src={img()}
					alt={props.alt}
					class={["rounded-sm border border-rule object-cover", fit(), props.class].join(
						" ",
					)}
				/>
			)}
		</Show>
	);
}
