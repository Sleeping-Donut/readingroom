import { describe, it, expect } from "vite-plus/test";
import { createRoot, flush } from "solid-js";
import { createViewPreference } from "../components/ViewToggle";

const PREFIX = "readingroom.view.";

function installLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  Object.defineProperty(globalThis, "localStorage", { value: ls, configurable: true });
  return ls;
}

describe("createViewPreference", () => {
  it("creates a reactive view preference and persists changes", () => {
    const ls = installLocalStorage();
    let view!: ReturnType<typeof createViewPreference>[0];
    let setView!: ReturnType<typeof createViewPreference>[1];
    expect(() => {
      createRoot(() => {
        [view, setView] = createViewPreference("regression-test");
      });
    }).not.toThrow();
    expect(view()).toBe("grid");
    setView("list");
    flush();
    expect(view()).toBe("list");
    expect(ls.getItem(PREFIX + "regression-test")).toBe("list");
  });
});
