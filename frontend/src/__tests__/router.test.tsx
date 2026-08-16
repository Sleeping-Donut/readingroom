import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { Router } from "../router";

afterEach(cleanup);

describe("App Router", () => {
  test("renders the settings layout for the /settings route", async () => {
    window.history.replaceState({}, "", "/settings");

    render(() => <Router>{(props) => <div>{props.children}</div>}</Router>);

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Library" })).toBeInTheDocument();
  });
});
