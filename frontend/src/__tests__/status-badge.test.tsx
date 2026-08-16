import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { StatusBadge } from "../components/books/StatusBadge";

afterEach(cleanup);

describe("<StatusBadge />", () => {
  test("renders a Tracked label for the tracked status", () => {
    render(() => <StatusBadge status="tracked" />);
    expect(screen.getByText("Tracked")).toBeInTheDocument();
  });

  test("renders a Getting label for the getting status", () => {
    render(() => <StatusBadge status="getting" />);
    expect(screen.getByText("Getting")).toBeInTheDocument();
  });

  test("renders a Have label for the have status", () => {
    render(() => <StatusBadge status="have" />);
    expect(screen.getByText("Have")).toBeInTheDocument();
  });

  test("renders nothing for an unknown status", () => {
    const { container } = render(() => <StatusBadge status="unknown" />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders nothing when no status is provided", () => {
    const { container } = render(() => <StatusBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
