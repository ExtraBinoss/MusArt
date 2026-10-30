import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FontRenderStatus } from "../../../../src/components/properties/fonts/FontRenderStatus";
import type { FontRenderState } from "../../../../src/state/session/font-presentation";

test("keeps the renderer generation/family correlated with accessible pending, ready and failure states", () => {
  const state: FontRenderState & { label: string } = {
    available: true,
    status: "pending",
    label: "Lora",
    ticket: {
      sequence: 3,
      projectId: "project",
      pageId: "page",
      revision: 2,
      layerId: "layer",
      family: "Lora",
      weight: 400,
      fontId: "lora",
    },
  };
  const view = render(<FontRenderStatus state={state} />);
  expect(screen.getByRole("status")).toHaveAttribute("data-font-render-generation", "3");
  expect(screen.getByRole("status")).toHaveAttribute("data-font-render-status", "pending");
  view.rerender(<FontRenderStatus state={{ ...state, status: "ready" }} />);
  expect(screen.getByRole("status")).toHaveAttribute("data-font-render-status", "ready");
  view.rerender(<FontRenderStatus state={{ ...state, status: "error" }} />);
  expect(screen.getByRole("status")).toHaveAttribute("data-font-render-status", "error");
  view.rerender(<FontRenderStatus />);
  expect(screen.queryByRole("status")).toBeNull();
});
