export default function StatusDot(props: { status: string }) {
	return (
		<span
			class={[
				"inline-block h-2.5 w-2.5 shrink-0 rounded-full",
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
