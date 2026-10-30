import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MorphPath } from "../../../../src/ui/brand/morph/MorphPath";
const tweens = vi.hoisted(
  () =>
    [] as {
      update: (value: number) => void;
      complete: () => void;
      controls: {
        stop: ReturnType<typeof vi.fn>;
        pause: ReturnType<typeof vi.fn>;
        play: ReturnType<typeof vi.fn>;
        complete: ReturnType<typeof vi.fn>;
      };
    }[],
);
vi.mock("motion", () => ({
  animate: (
    _a: number,
    _b: number,
    options: { onUpdate: (value: number) => void; onComplete: () => void },
  ) => {
    const controls = {
      stop: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      complete: vi.fn(() => options.onComplete()),
    };
    tweens.push({ update: options.onUpdate, complete: options.onComplete, controls });
    return controls;
  },
}));
test("uses the copied numeric interpolator, retargets from displayed coordinates and retires stale callbacks", () => {
  tweens.length = 0;
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const view = render(
    <svg>
      <MorphPath d="M0 0L10 10Z" fill="#000000" />
    </svg>,
  );
  const path = view.container.querySelector("path")!;
  view.rerender(
    <svg>
      <MorphPath d="M10 10L20 20Z" fill="#000000" />
    </svg>,
  );
  const first = tweens.at(-1)!;
  first.update(0.5);
  expect(path).toHaveAttribute("d", "M5 5L15 15Z");
  view.rerender(
    <svg>
      <MorphPath d="M20 20L30 30Z" fill="#000000" />
    </svg>,
  );
  expect(first.controls.stop).toHaveBeenCalled();
  const next = tweens.at(-1)!;
  next.update(0);
  expect(path).toHaveAttribute("d", "M5 5L15 15Z");
  first.update(1);
  first.complete();
  expect(path).toHaveAttribute("d", "M5 5L15 15Z");
  next.update(0.5);
  expect(path).toHaveAttribute("d", "M12.5 12.5L22.5 22.5Z");
  view.unmount();
  next.update(1);
  next.complete();
  expect(next.controls.stop).toHaveBeenCalled();
  expect(path).toHaveAttribute("d", "M12.5 12.5L22.5 22.5Z");
});
test("hidden tabs pause, visible tabs resume and reduced motion completes rather than looping", () => {
  tweens.length = 0;
  let hidden = false,
    reduced = false;
  const change = new Set<() => void>();
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.mocked(window.matchMedia).mockImplementation((media) => ({
    get matches() {
      return reduced;
    },
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addEventListener: (_type: string, listener: unknown) => {
      change.add(listener as () => void);
    },
    removeEventListener: (_type: string, listener: unknown) => {
      change.delete(listener as () => void);
    },
  }));
  const view = render(
    <svg>
      <MorphPath opacity={0} />
    </svg>,
  );
  view.rerender(
    <svg>
      <MorphPath opacity={1} />
    </svg>,
  );
  const tween = tweens.at(-1)!;
  hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(tween.controls.pause).toHaveBeenCalled();
  hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(tween.controls.play).toHaveBeenCalled();
  reduced = true;
  for (const listener of change) listener();
  expect(tween.controls.complete).toHaveBeenCalled();
  expect(view.container.querySelector("path")).toHaveAttribute("opacity", "1");
  view.unmount();
  expect(change.size).toBe(0);
});
