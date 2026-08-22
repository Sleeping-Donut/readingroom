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
		<div class="bg-gray-950 flex min-h-screen items-center justify-center">
			<Title>Sign In · ReadingRoom</Title>
			<div class="max-w-sm w-full">
				<h1 class="text-2xl font-bold text-indigo-400 mb-8 text-center">ReadingRoom</h1>
				<form onSubmit={submit} class="bg-gray-900 rounded-lg p-6 space-y-4">
					<h2 class="text-lg font-semibold text-gray-100">
						{isRegister() ? "Create Account" : "Sign In"}
					</h2>

					<Show when={error()}>
						<div class="bg-red-900/50 text-red-300 text-sm p-3 rounded border-red-800 border">
							{error()}
						</div>
					</Show>

					<div>
						<label class="text-sm text-gray-400 mb-1 block">Username</label>
						<input
							type="text"
							value={username()}
							onInput={(e) => {
								setUsername(e.currentTarget.value);
							}}
							class="bg-gray-800 border-gray-700 rounded px-3 py-2 text-gray-100 focus:border-indigo-500 w-full border focus:outline-none"
							required
							minlength={3}
						/>
					</div>

					<div>
						<label class="text-sm text-gray-400 mb-1 block">Password</label>
						<input
							type="password"
							value={password()}
							onInput={(e) => {
								setPassword(e.currentTarget.value);
							}}
							class="bg-gray-800 border-gray-700 rounded px-3 py-2 text-gray-100 focus:border-indigo-500 w-full border focus:outline-none"
							required
							minlength={8}
						/>
					</div>

					<button
						type="submit"
						disabled={loading()}
						class="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium py-2 rounded w-full transition-colors"
					>
						{loading() ? "Loading..." : isRegister() ? "Register" : "Sign In"}
					</button>

					<button
						type="button"
						onClick={() => {
							setIsRegister(!isRegister());
							setError("");
						}}
						class="text-sm text-gray-500 hover:text-gray-300 w-full"
					>
						{isRegister() ? "Already have an account? Sign in" : "No account? Register"}
					</button>
				</form>
			</div>
		</div>
	);
}
