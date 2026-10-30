import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MeltLogo } from "../../../src/ui/brand/MeltLogo";
import { createBrandActivity } from "../../../src/ui/brand/activity";

test("renders a genuine Dahlia SVG with explicit identity, local IDs and zero idle animation", () => {
  const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  render(
    <>
      <MeltLogo decorative={false} size={42} />
      <MeltLogo />
    </>,
  );
  const logo = screen.getByRole("img", { name: "Melt" });
  expect(logo.tagName.toLowerCase()).toBe("svg");
  expect(logo).toHaveAttribute("width", "42");
  expect(logo).toHaveStyle({ width: "42px", height: "42px" });
  expect(logo.querySelector('path[fill="#A259FF"]')?.getAttribute("d")).toMatch(/^M.*C.*Z$/);
  expect(document.querySelectorAll("clipPath")).toHaveLength(2);
  const ids = [...document.querySelectorAll("clipPath")].map((node) => node.id);
  expect(new Set(ids).size).toBe(2);
  expect(request).not.toHaveBeenCalled();
});
test("actual activity controls one imperative clock and unmount/StrictMode release every owner", () => {
  const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(7),
    cancel = vi.spyOn(window, "cancelAnimationFrame");
  const activity = createBrandActivity(false);
  const view = render(
    <StrictMode>
      <MeltLogo state="loading" activity={activity} />
    </StrictMode>,
  );
  const before = request.mock.calls.length;
  act(() => activity.set(true));
  expect(request.mock.calls.length).toBe(before + 1);
  act(() => activity.set(false));
  expect(cancel).toHaveBeenLastCalledWith(7);
  const svg = view.container.querySelector("svg")!;
  view.unmount();
  expect(svg.children).toHaveLength(0);
  const stopped = request.mock.calls.length;
  activity.set(true);
  expect(request.mock.calls.length).toBe(stopped);
});
