import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PresentationBoundary } from "../../../../src/components/shared/overlays/PresentationBoundary";
import { getUiPresentation } from "../../../../src/state/session/ui-presentation";
afterEach(() => vi.useRealTimers());
it("returns children without a DOM wrapper and releases on unmount", () => {
  vi.useFakeTimers();
  const port = getUiPresentation(),
    view = render(
      <PresentationBoundary>
        <button>Value</button>
      </PresentationBoundary>,
    );
  expect(view.container.firstElementChild).toBe(screen.getByRole("button"));
  expect(port.busy()).toBe(true);
  view.unmount();
  expect(port.busy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it("expires without rerendering children and stale cleanup cannot clear another boundary", () => {
  vi.useFakeTimers();
  const renderChild = vi.fn();
  function Child() {
    renderChild();
    return <span>Ready</span>;
  }
  const first = render(
    <PresentationBoundary>
      <Child />
    </PresentationBoundary>,
  );
  vi.advanceTimersByTime(250);
  expect(getUiPresentation().busy()).toBe(false);
  expect(renderChild).toHaveBeenCalledOnce();
  const second = render(<PresentationBoundary />);
  first.unmount();
  expect(getUiPresentation().busy()).toBe(true);
  second.unmount();
  expect(getUiPresentation().busy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
