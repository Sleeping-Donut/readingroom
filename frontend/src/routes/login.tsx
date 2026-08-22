import { Title } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { action, createSignal, Show } from "solid-js";

import { login, register } from "../api/auth";
import { paths } from "../router";

export default function Login() {
	const navigate = useNavigate();
	const [username, setUsername] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [error, setError] = createSignal("");
	const [isRegister, setIsRegister] = createSignal(false);
	const [loading, setLoading] = createSignal(false);

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
		} finally {
			setLoading(false);
		}
	});

	return (
		<div class="flex min-h-screen items-center justify-center bg-gray-950">
			<Title>Sign In · ReadingRoom</Title>
			<div class="w-full max-w-sm">
				<h1 class="mb-8 text-center text-2xl font-bold text-indigo-400">ReadingRoom</h1>
				<form onSubmit={submit} class="space-y-4 rounded-lg bg-gray-900 p-6">
					<h2 class="text-lg font-semibold text-gray-100">
						{isRegister() ? "Create Account" : "Sign In"}
					</h2>

					<Show when={error()}>
						<div class="rounded border border-red-800 bg-red-900/50 p-3 text-sm text-red-300">
							{error()}
						</div>
					</Show>

					<div>
						<label class="mb-1 block text-sm text-gray-400">Username</label>
						<input
							type="text"
							value={username()}
							onInput={(e) => {
								setUsername(e.currentTarget.value);
							}}
							class="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-indigo-500 focus:outline-hidden"
							required
							minlength={3}
						/>
					</div>

					<div>
						<label class="mb-1 block text-sm text-gray-400">Password</label>
						<input
							type="password"
							value={password()}
							onInput={(e) => {
								setPassword(e.currentTarget.value);
							}}
							class="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 focus:border-indigo-500 focus:outline-hidden"
							required
							minlength={8}
						/>
					</div>

					<button
						type="submit"
						disabled={loading()}
						class="w-full rounded bg-indigo-600 py-2 font-medium text-white transition-colors hover:bg-indigo-500 disabled:bg-indigo-800"
					>
						{loading() ? "Loading..." : isRegister() ? "Register" : "Sign In"}
					</button>

					<button
						type="button"
						onClick={() => {
							setIsRegister(!isRegister());
							setError("");
						}}
						class="w-full text-sm text-gray-500 hover:text-gray-300"
					>
						{isRegister() ? "Already have an account? Sign in" : "No account? Register"}
					</button>
				</form>
			</div>
		</div>
	);
}
