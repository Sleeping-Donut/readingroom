import { createEffect, onSettled, type Component, type ParentProps, Errored } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { Router, paths } from "./router";
import { Layout } from "./components/Layout";
import { user, checkAuthEnabled, authEnabled } from "./api/auth";
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
        <div class="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
          <div class="max-w-md p-6 bg-gray-900 rounded-lg border border-red-800 text-center">
            <p class="text-lg font-semibold text-red-400 mb-2">Something went wrong</p>
            <p class="text-sm text-gray-400 mb-4 break-words">{String(err())}</p>
            <button
              onClick={reset}
              class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
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
