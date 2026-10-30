import { act, render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { BrandStatus } from "../../../src/ui/brand/BrandStatus";
import { createBrandActivity } from "../../../src/ui/brand/activity";
test("operation marks stay decorative beside their owner's existing live status text", () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const view = render(<BrandStatus size={36} state="preparing" />);
  expect(view.container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  expect(view.container.querySelector("svg")).toHaveAttribute("data-brand-state", "preparing");
  expect(view.container.querySelector("svg")).toHaveAttribute("width", "36");
  expect(view.container.querySelector('[role="status"]')).toBeNull();
});

test("inactive operations allocate no hidden SVG engine nodes and completion releases the active leaf", () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const activity = createBrandActivity(false),
    view = render(<BrandStatus activity={activity} />);
  expect(view.container.querySelector("svg")).toBeNull();
  act(() => activity.set(true));
  expect(view.container.querySelector("svg")).not.toBeNull();
  act(() => activity.set(false));
  expect(view.container.querySelector("svg")).toBeNull();
});
