/* @refresh reload */
import "./index.css";
import { render } from "solid-js/web";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import App from "./App";

const queryClient = new QueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  ),
  root,
);
