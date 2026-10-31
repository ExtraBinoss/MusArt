import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MotionPreviewSurface } from "../../../../../src/components/projects/templates/motion-preview/MotionPreviewSurface";
import "../../../../../src/state/i18n";

test("carousel motion releases GPU work and rejects hover until the rail settles", () => {
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
    <div data-carousel>
      <button>
        <MotionPreviewSurface startPreview={start} poster="cached.webp" />
      </button>
    </div>,
  );
  const button = screen.getByRole("button"),
    rail = button.parentElement!;
  fireEvent.pointerEnter(button);
  expect(start).toHaveBeenCalledOnce();
  rail.dataset.carouselMoving = "true";
  fireEvent(rail, new CustomEvent("musart:carousel-motion"));
  expect(release).toHaveBeenCalledOnce();
  fireEvent.pointerEnter(button);
  expect(start).toHaveBeenCalledOnce();
  delete rail.dataset.carouselMoving;
  fireEvent.focusIn(button);
  expect(start).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(release).toHaveBeenCalledTimes(2);
});

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

test("separate preview controls keep pause and retry out of the card activation target", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const release = vi.fn(async () => undefined),
    setPaused = vi.fn(),
    opened = vi.fn();
  let report!: (
    value: import("../../../../../src/components/projects/templates/motion-preview/runtime").PreviewStatus,
  ) => void;
  const start = vi.fn((_host: HTMLElement, onStatus: typeof report) => {
    report = onStatus;
    onStatus("loading");
    return { release, setPaused };
  });
  const view = render(
    <div className="template-card-entry" data-preview-owner>
      <button onClick={opened}>
        <MotionPreviewSurface startPreview={start} poster="cached.webp" />
      </button>
    </div>,
  );
  const owner = view.container.firstElementChild!;
  fireEvent.pointerEnter(owner);
  const root = view.container.querySelector(".motion-template-preview")!;
  act(() => report("playing"));
  const pause = view.container.querySelector<HTMLButtonElement>(".motion-preview-control")!;
  expect(pause.closest("button")!.parentElement).toBe(owner);
  expect(pause).toHaveAttribute("data-status", "playing");
  fireEvent.pointerDown(pause);
  fireEvent.click(pause);
  expect(release).not.toHaveBeenCalled();
  expect(setPaused).toHaveBeenCalledWith(true);
  expect(opened).not.toHaveBeenCalled();
  act(() => report("failed"));
  fireEvent.click(pause);
  expect(start).toHaveBeenCalledTimes(2);
  expect(root).toHaveAttribute("data-preview-status", "loading");
  view.unmount();
  expect(release).toHaveBeenCalledTimes(2);
});
