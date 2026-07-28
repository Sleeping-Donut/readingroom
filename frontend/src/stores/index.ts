import { createStore } from "solid-js/store";

interface UIState {
  sidebarOpen: boolean;
  theme: "dark";
}

const [ui, setUI] = createStore<UIState>({
  sidebarOpen: false,
  theme: "dark",
});

export { ui, setUI };
