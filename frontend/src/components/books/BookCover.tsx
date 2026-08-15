import { Show } from "solid-js";

export function BookCover(props: {
  src?: string;
  alt: string;
  class?: string;
  emojiClass?: string;
}) {
  return (
    <Show
      when={props.src}
      fallback={
        <div class={["bg-gray-800 flex items-center justify-center", props.class]}>
          <span class={["text-gray-600", props.emojiClass ?? ""]}>📖</span>
        </div>
      }
    >
      {(img) => <img src={img()} alt={props.alt} class={["object-cover", props.class]} />}
    </Show>
  );
}
