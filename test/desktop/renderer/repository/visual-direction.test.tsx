// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RepositoryToolbar } from "../../../../src/desktop/renderer/repository/RepositoryToolbar.js";

describe("desktop visual direction", () => {
  it("uses English copy for the first repository action", () => {
    render(
      <RepositoryToolbar
        repository={{ status: "empty" }}
        range={{ status: "idle" }}
        onOpenRepository={vi.fn()}
        onLoadRange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", {
      level: 2,
      name: "Repository and comparison range",
    })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open Repository" })).toBeVisible();
    expect(screen.getByText("Choose a local Git repository to review.")).toBeVisible();
  });
});
