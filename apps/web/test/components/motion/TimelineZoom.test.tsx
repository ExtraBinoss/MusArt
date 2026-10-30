import "../../../src/state/i18n";
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineZoom } from "../../../src/components/motion/TimelineZoom";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import "../../../src/components/motion/messages";
const probe = vi.hoisted(() => ({ content: vi.fn() }));
vi.mock("../../../src/components/ui/tooltip", async (original) => {
  const actual = await original<typeof import("../../../src/components/ui/tooltip")>();
  return {
    ...actual,
    TooltipContent(props: ComponentProps<typeof actual.TooltipContent>) {
      probe.content();
      return <actual.TooltipContent {...props} />;
    },
  };
});
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

it("retains the open tooltip across controlled zoom updates while preserving live slider input", async () => {
  const onPreview = vi.fn(),
    onCommit = vi.fn(),
    user = userEvent.setup();
  const content = (value: number) => (
    <TooltipProvider>
      <TimelineZoom value={value} disabled={false} onPreview={onPreview} onCommit={onCommit} />
    </TooltipProvider>
  );
  const view = render(content(120));
  const slider = screen.getByRole("slider");
  await user.hover(slider);
  const tooltip = await screen.findByRole("tooltip");
  const renders = probe.content.mock.calls.length;
  for (const value of [130, 180, 400, 20, 640, 180]) view.rerender(content(value));
  expect(probe.content).toHaveBeenCalledTimes(renders);
  expect(screen.getByRole("tooltip")).toBe(tooltip);
  expect(slider).toHaveAttribute("aria-valuenow", "180");
  slider.focus();
  await user.keyboard("{ArrowRight}");
  expect(onPreview).toHaveBeenLastCalledWith(190);
  expect(onCommit).toHaveBeenLastCalledWith(190);
});
