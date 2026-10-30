import { createRef } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { TrackDurationTooltip } from "../../../src/components/motion/TrackDurationTooltip";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "../../../src/components/ui/context-menu";
import { createClipDurationTooltipPreview } from "../../../src/components/motion/gestures/tooltip";
import { pointer } from "./support";
import { i18n } from "../../../src/state/i18n";

it("forwards context handlers and refs through its transparent Radix slot", async () => {
  const ref = createRef<HTMLElement>(),
    d = setup();
  d.mount(
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TrackDurationTooltip
          ref={ref}
          trackId="clip"
          start={{ value: 0, rate: 1 }}
          end={{ value: 2, rate: 1 }}
          unit="s"
        >
          <div data-testid="wrap">
            <button>Move</button>
          </div>
        </TrackDurationTooltip>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Clip action</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>,
  );
  expect(ref.current).toBe(screen.getByTestId("wrap"));
  fireEvent.contextMenu(screen.getByTestId("wrap"));
  expect(await screen.findByRole("menuitem", { name: "Clip action" })).toBeVisible();
});

it("a simple click and sub-threshold hold never mount a duration popup or publish tooltip state", () => {
  vi.useFakeTimers();
  const d = setup(),
    translate = vi.spyOn(i18n, "t");
  const view = d.mount(
    <TrackDurationTooltip
      trackId="click"
      start={{ value: 0, rate: 1 }}
      end={{ value: 2, rate: 1 }}
      unit="ms"
    >
      <div>
        <button className="motion-track">Move</button>
      </div>
    </TrackDurationTooltip>,
  );
  const button = screen.getByRole("button", { name: "Move" });
  vi.spyOn(button, "hasPointerCapture").mockImplementation((id) => id === 7);
  const count = () => translate.mock.calls.filter(([key]) => key === "clipDuration").length;
  const initial = count();
  try {
    act(() => pointer(button, "pointerdown", 10));
    expect(count()).toBe(initial);
    act(() => pointer(button, "pointermove", 15));
    act(() => { vi.advanceTimersByTime(350); });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull();
    act(() => pointer(button, "pointerup", 15));
    expect(count()).toBe(initial);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it.each([
  { kind: "trim", className: "motion-trim-handle", first: 11 },
  { kind: "move", className: "motion-track", first: 16 },
])(
  "cold $kind admits the latest imperative duration only after real movement, then retains its popup",
  async ({ className, first }) => {
    const d = setup(),
      translate = vi.spyOn(i18n, "t");
    let preview: ReturnType<typeof createClipDurationTooltipPreview> | null = null;
    const view = d.mount(
      <TrackDurationTooltip
        trackId="clip"
        start={{ value: 0, rate: 1 }}
        end={{ value: 2, rate: 1 }}
        unit="ms"
      >
        <div>
          <button
            className={className}
            onPointerDown={(event) => {
              event.preventDefault();
              preview = createClipDurationTooltipPreview(event.currentTarget);
              preview.set({ value: 7, rate: 4 });
            }}
            onPointerMove={() => preview?.set({ value: 3, rate: 2 })}
          >
            Gesture
          </button>
        </div>
      </TrackDurationTooltip>,
    );
    const button = screen.getByRole("button", { name: "Gesture" });
    vi.spyOn(button, "hasPointerCapture").mockImplementation((id) => id === 7);
    act(() => pointer(button, "pointerdown", 10));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => pointer(button, "pointermove", first));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("1500 ms");
    const entered = translate.mock.calls.filter(([key]) => key === "clipDuration").length;
    act(() => {
      for (let i = 0; i < 20; i++) pointer(button, "pointermove", 20 + i);
    });
    expect(translate.mock.calls.filter(([key]) => key === "clipDuration")).toHaveLength(entered);
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    act(() => pointer(button, "pointerup", 40));
    (preview as ReturnType<typeof createClipDurationTooltipPreview> | null)?.dispose();
    view.unmount();
  },
);

it("ignores rejected gestures and keeps a vertical reorder from turning into a horizontal duration preview", () => {
  const d = setup();
  const view = d.mount(
    <TrackDurationTooltip
      trackId="clip"
      start={{ value: 0, rate: 1 }}
      end={{ value: 2, rate: 1 }}
      unit="s"
    >
      <div>
        <button className="motion-track">Move</button>
      </div>
    </TrackDurationTooltip>,
  );
  const button = screen.getByRole("button", { name: "Move" }),
    capture = vi.spyOn(button, "hasPointerCapture");
  capture.mockReturnValue(false);
  act(() => pointer(button, "pointerdown", 10));
  act(() => pointer(button, "pointermove", 30));
  expect(screen.queryByRole("tooltip")).toBeNull();
  act(() => pointer(button, "pointercancel", 30));
  capture.mockReturnValue(true);
  act(() => pointer(button, "pointerdown", 10, 0));
  act(() => pointer(button, "pointermove", 10, 8));
  act(() => pointer(button, "pointermove", 80, 8));
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.keyDown(button, { key: "Escape" });
  act(() => pointer(button, "pointermove", 100, 8));
  expect(screen.queryByRole("tooltip")).toBeNull();
  view.unmount();
});
