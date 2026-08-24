import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { action, createOptimistic, createSignal, Show } from "solid-js";

import { login, register } from "../api/auth";
import { paths } from "../router";

export default function Login() {
	const navigate = useNavigate();
	const [username, setUsername] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [error, setError] = createSignal<string | null>(null);
	const [isRegister, setIsRegister] = createSignal(false);
	const [loading, setLoading] = createOptimistic(false);

	const submit = action(async function* (e: Event) {
		e.preventDefault();
		setLoading(true);
		setError("");
		try {
			if (isRegister()) {
				await register(username(), password());
			} else {
				await login(username(), password());
			}
			yield;
			navigate(paths(), { replace: true });
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "An error occurred");
		}
	});

	return (
		<div class="flex min-h-screen flex-col items-center justify-center bg-paper-50 px-4">
			<Title>Sign In · ReadingRoom</Title>
			<div class="w-full max-w-sm">
				<h1 class="mb-10 text-center font-display text-5xl text-ink-900">ReadingRoom</h1>
				<form
					onSubmit={submit}
					class="space-y-4 rounded-sm border border-rule bg-paper-100 p-6"
				>
					<h2 class="text-lg font-semibold text-ink-900">
						{isRegister() ? "Create Account" : "Sign In"}
					</h2>

					<Show when={error()}>
						<div class="rounded-sm border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
							{error()}
						</div>
					</Show>

					<div>
						<label
							for="login-username"
							class="mb-1 block font-meta text-xs tracking-widest text-ink-500 uppercase"
						>
							Username
						</label>
						<input
							id="login-username"
							type="text"
							value={username()}
							onInput={(e) => {
								setUsername(e.currentTarget.value);
							}}
							class="w-full rounded-sm border border-rule bg-paper-200 px-3 py-2 text-ink-900 focus:border-ink-900 focus:outline-hidden"
							required
							minlength={3}
						/>
					</div>

					<div>
						<label
							for="login-password"
							class="mb-1 block font-meta text-xs tracking-widest text-ink-500 uppercase"
						>
							Password
						</label>
						<input
							id="login-password"
							type="password"
							value={password()}
							onInput={(e) => {
								setPassword(e.currentTarget.value);
							}}
							class="w-full rounded-sm border border-rule bg-paper-200 px-3 py-2 text-ink-900 focus:border-ink-900 focus:outline-hidden"
							required
							minlength={8}
						/>
					</div>

					<button
						type="submit"
						disabled={loading()}
						class="w-full rounded-sm bg-ink-900 py-2 font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50"
					>
						{loading() ? "Loading..." : isRegister() ? "Register" : "Sign In"}
					</button>

					<button
						type="button"
						onClick={() => {
							setIsRegister(!isRegister());
							setError("");
						}}
						class="w-full text-sm text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
					>
						{isRegister() ? "Already have an account? Sign in" : "No account? Register"}
					</button>
				</form>
			</div>
		</div>
	);
}
