import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createRoot, flush, type Accessor, type Setter } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { createViewPreference, ViewToggle, type ViewMode } from "../components/ViewToggle";

const PREFIX = "readingroom.view.";
const TEST_KEY = "component-test";

function installLocalStorage() {
	const store = new Map<string, string>();
	const ls = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
		clear: () => store.clear(),
	};
	Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
	return ls;
}

beforeEach(() => {
	installLocalStorage();
});

afterEach(() => {
	cleanup();
});

describe("<ViewToggle />", () => {
	test("clicking the List button calls onChange with list", () => {
		const onChange = vi.fn<(view: ViewMode) => void>();
		render(() => <ViewToggle view="grid" onChange={onChange} />);

		fireEvent.click(screen.getByRole("button", { name: "List" }));

		expect(onChange).toHaveBeenCalledWith("list");
	});

	test("clicking the Grid button calls onChange with grid", () => {
		const onChange = vi.fn<(view: ViewMode) => void>();
		render(() => <ViewToggle view="list" onChange={onChange} />);

		fireEvent.click(screen.getByRole("button", { name: "Grid" }));

		expect(onChange).toHaveBeenCalledWith("grid");
	});
});

describe("createViewPreference", () => {
	test("persists the selected view to localStorage through the wrapped setter", () => {
		let view!: Accessor<ViewMode>;
		let setView!: Setter<ViewMode>;
		createRoot(() => {
			[view, setView] = createViewPreference(TEST_KEY);
		});

		setView("list");
		flush();

		expect(view()).toBe("list");
		expect(localStorage.getItem(PREFIX + TEST_KEY)).toBe(JSON.stringify("list"));
	});

	test("clicking the toggle persists the preference to localStorage", () => {
		let view!: Accessor<ViewMode>;
		let setView!: Setter<ViewMode>;
		render(() => {
			[view, setView] = createViewPreference(TEST_KEY);
			return <ViewToggle view={view()} onChange={(mode) => setView(mode)} />;
		});

		fireEvent.click(screen.getByRole("button", { name: "List" }));
		flush();

		expect(view()).toBe("list");
		expect(localStorage.getItem(PREFIX + TEST_KEY)).toBe(JSON.stringify("list"));
	});
});
