import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Throbber } from "../../../../src/components/ui/throbber/Throbber";

test("fast operations never flash a loader, while slow operations announce once and fade without delaying results", () => {
  vi.useFakeTimers();
  const view = render(<Throbber label="Loading projects" variant="shimmer" />);
  expect(screen.queryByRole("status")).toBeNull();
  act(() => {
    vi.advanceTimersByTime(100);
  });
  view.rerender(<Throbber active={false} label="Loading projects" variant="shimmer" />);
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(view.container.querySelector("svg")).toBeNull();
  view.rerender(<Throbber active label="Loading projects" variant="shimmer" />);
  act(() => {
    vi.advanceTimersByTime(160);
  });
  expect(screen.getByRole("status")).toHaveTextContent("Loading projects");
  expect(view.container.querySelector("svg")).toHaveAttribute("data-brand-state", "working");
  view.rerender(<Throbber active={false} label="Loading projects" variant="shimmer" />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(view.container.querySelector("svg")).toHaveAttribute("data-brand-state", "working");
  expect(view.container.querySelector("svg")).toHaveAttribute("data-brand-active", "false");
  expect(view.container.firstChild).toHaveAttribute("data-visible", "false");
  act(() => {
    vi.advanceTimersByTime(160);
  });
  expect(view.container.querySelector("svg")).toBeNull();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
