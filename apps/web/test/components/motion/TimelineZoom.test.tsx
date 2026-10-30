import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineZoom } from "../../../src/components/motion/TimelineZoom";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import "../../../src/components/motion/messages";
it("keeps the existing primary shared zoom control and accessible limits", () => {
  render(
    <TooltipProvider>
      <TimelineZoom value={120} disabled={false} onPreview={vi.fn()} onCommit={vi.fn()} />
    </TooltipProvider>,
  );
  const slider = screen.getByRole("slider");
  expect(slider.getAttribute("aria-valuemin")).toBe("20");
  expect(slider.getAttribute("aria-valuemax")).toBe("640");
  expect(slider.getAttribute("aria-valuenow")).toBe("120");
});
