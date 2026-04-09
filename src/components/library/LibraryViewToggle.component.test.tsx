/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryViewToggle } from "./LibraryViewToggle";

afterEach(() => {
  cleanup();
});

describe("LibraryViewToggle", () => {
  it("calls onViewChange when switching to list", async () => {
    const onViewChange = vi.fn();
    render(<LibraryViewToggle view="grid" onViewChange={onViewChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("library-view-list"));
    expect(onViewChange).toHaveBeenCalledWith("list");
  });

  it("calls onViewChange when switching to grid", async () => {
    const onViewChange = vi.fn();
    render(<LibraryViewToggle view="list" onViewChange={onViewChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("library-view-grid"));
    expect(onViewChange).toHaveBeenCalledWith("grid");
  });
});
