/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShelfRuleMatchControls } from "./ShelfRuleMatchControls";

afterEach(() => {
  cleanup();
});

describe("ShelfRuleMatchControls", () => {
  it("changes match mode via select", async () => {
    const onMatchChange = vi.fn();
    render(
      <ShelfRuleMatchControls
        match="all"
        onMatchChange={onMatchChange}
        onAddCondition={vi.fn()}
        onPreview={vi.fn()}
        busy={false}
        conditionCount={0}
      />,
    );
    const user = userEvent.setup();

    await user.selectOptions(screen.getByTestId("shelf-rule-match-select"), "any");
    expect(onMatchChange).toHaveBeenCalledWith("any");
  });

  it("invokes onAddCondition", async () => {
    const onAddCondition = vi.fn();
    render(
      <ShelfRuleMatchControls
        match="all"
        onMatchChange={vi.fn()}
        onAddCondition={onAddCondition}
        onPreview={vi.fn()}
        busy={false}
        conditionCount={0}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByTestId("shelf-rule-add-condition"));
    expect(onAddCondition).toHaveBeenCalled();
  });
});
