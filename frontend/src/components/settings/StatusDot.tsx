export default function StatusDot(props: { status: string }) {
  return (
    <span
      class={[
        "inline-block w-2.5 h-2.5 rounded-full shrink-0",
        { "animate-pulse": props.status === "testing" },
      ]}
      style={{
        "background-color":
          props.status === "success"
            ? "#22c55e"
            : props.status === "error"
              ? "#ef4444"
              : props.status === "testing"
                ? "#eab308"
                : "#6b7280",
      }}
    />
  );
}
