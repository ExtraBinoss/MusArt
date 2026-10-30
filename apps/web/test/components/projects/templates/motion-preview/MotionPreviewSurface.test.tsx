import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MotionPreviewSurface } from "../../../../../src/components/projects/templates/motion-preview/MotionPreviewSurface";
import "../../../../../src/state/i18n";

test("the generic saved/template surface stops native resources on page hiding and pointer gestures", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const release = vi.fn(async () => undefined),
    start = vi.fn(() => ({ release }));
  const view = render(
    <button>
      <MotionPreviewSurface startPreview={start}>
        <span>Cached poster pending</span>
      </MotionPreviewSurface>
    </button>,
  );
  const button = screen.getByRole("button");
  expect(start).not.toHaveBeenCalled();
  fireEvent.pointerEnter(button);
  expect(start).toHaveBeenCalledOnce();
  fireEvent(document, new Event("visibilitychange"));
  expect(release).toHaveBeenCalledOnce();
  fireEvent.pointerLeave(button);
  fireEvent.pointerEnter(button);
  expect(start).toHaveBeenCalledTimes(2);
  fireEvent.pointerDown(button);
  fireEvent.focusIn(button);
  expect(start).toHaveBeenCalledTimes(2);
  expect(release).toHaveBeenCalledTimes(2);
  view.unmount();
});

test("rebinding beneath a real fine pointer resumes intent without autoplaying an active drag", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const matches = HTMLElement.prototype.matches;
  let pressed = false;
  vi.spyOn(HTMLElement.prototype, "matches").mockImplementation(function (
    this: HTMLElement,
    selector: string,
  ) {
    return selector === ":hover"
      ? this.tagName === "BUTTON"
      : selector === ":active"
        ? pressed
        : matches.call(this, selector);
  });
  const release = vi.fn(async () => undefined),
    first = vi.fn(() => ({ release })),
    second = vi.fn(() => ({ release }));
  const view = render(
    <button>
      <MotionPreviewSurface startPreview={first} poster="cached.webp" />
    </button>,
  );
  expect(first).toHaveBeenCalledOnce();
  view.rerender(
    <button>
      <MotionPreviewSurface startPreview={second} poster="cached-new.webp" />
    </button>,
  );
  expect(release).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  pressed = true;
  const third = vi.fn(() => ({ release }));
  view.rerender(
    <button>
      <MotionPreviewSurface startPreview={third} poster="cached-new.webp" />
    </button>,
  );
  expect(third).not.toHaveBeenCalled();
});
