import { Show } from "solid-js";

export function AuthorCover(props: {
	src?: string;
	alt: string;
	name: string;
	class?: string;
	placeholder?: boolean;
}) {
	return (
		<Show
			when={props.src}
			fallback={
				props.placeholder ? (
					<div class={["bg-gray-800 flex items-center justify-center", props.class]}>
						<span class="text-sm font-medium text-gray-500">
							{props.name.charAt(0).toUpperCase()}
						</span>
					</div>
				) : null
			}
		>
			{(img) => <img src={img()} alt={props.alt} class={["object-cover", props.class]} />}
		</Show>
	);
}
