import { useLocation, useNavigate } from "@solidjs/router";
import { createEffect, onSettled, type Component, type ParentProps, Errored } from "solid-js";

import { user, checkAuthEnabled, authEnabled } from "./api/auth";
import { Layout } from "./components/Layout";
import { Router, paths } from "./router";
import "./index.css";

const AuthLayout: Component<ParentProps> = (props) => {
	const location = useLocation();
	const navigate = useNavigate();

	// Kick off the auth-enabled check once on mount.
	onSettled(() => {
		void checkAuthEnabled();
	});

	// Redirect to login when auth is enabled but no user is present.
	// Side effects go in the apply phase; the compute phase only reads.
	createEffect(
		() => authEnabled() && !user() && location.pathname !== "/login",
		(shouldRedirect) => {
			if (shouldRedirect) navigate(paths.login, { replace: true });
		},
	);

	return <Layout>{props.children}</Layout>;
};

function App() {
	return (
		<Errored
			fallback={(err, reset) => (
				<div class="flex min-h-screen items-center justify-center bg-gray-950 text-gray-100">
					<div class="max-w-md rounded-lg border border-red-800 bg-gray-900 p-6 text-center">
						<p class="mb-2 text-lg font-semibold text-red-400">Something went wrong</p>
						<p class="mb-4 text-sm break-words text-gray-400">{String(err())}</p>
						<button
							onClick={reset}
							class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-indigo-500"
						>
							Reset
						</button>
					</div>
				</div>
			)}
		>
			<Router>{(props) => <AuthLayout>{props.children}</AuthLayout>}</Router>
		</Errored>
	);
}

export default App;
