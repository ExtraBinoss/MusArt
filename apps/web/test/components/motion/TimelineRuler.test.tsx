import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../support/ui";
import { TimelineRuler } from "../../../src/components/motion/TimelineRuler";
import { makeTransport, pointer } from "./support";
import userEvent from "@testing-library/user-event";

it("seeks immediately during pointer movement and restores canceled presentation time", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  const view = d.mount(
    <TimelineRuler
      transport={runtime.transport}
      duration={2}
      pixelsPerSecond={240}
      left={0}
      width={500}
      unit="ms"
    />,
  );
  const ruler = screen.getByRole("slider", { name: "Se déplacer dans la timeline" });
  vi.spyOn(ruler, "getBoundingClientRect").mockReturnValue({ left: 200, width: 480 } as DOMRect);
  vi.spyOn(ruler, "hasPointerCapture").mockReturnValue(true);
  const release = vi.spyOn(ruler, "releasePointerCapture");
  act(() => pointer(ruler, "pointerdown", 440));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 1, rate: 1 });
  expect(ruler).toHaveAttribute("aria-valuetext", "1000 ms");
  act(() => pointer(ruler, "pointermove", 560));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 3, rate: 2 });
  act(() => pointer(ruler, "pointercancel", 560));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 0, rate: 1 });
  expect(release).toHaveBeenCalledWith(7);
  fireEvent.keyDown(ruler, { key: "ArrowRight" });
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 1, rate: 30 });
  fireEvent.keyDown(ruler, { key: "End" });
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 2, rate: 1 });
  fireEvent.keyDown(ruler, { key: "Home" });
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 0, rate: 1 });
  view.unmount();
  expect(runtime.listeners.size).toBe(0);
});

it("claims only its captured scrub moves before document-wide resize hit testing", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  const view = d.mount(
    <TimelineRuler
      transport={runtime.transport}
      duration={2}
      pixelsPerSecond={100}
      left={0}
      width={500}
      unit="ms"
    />,
  );
  const ruler = screen.getByRole("slider");
  vi.spyOn(ruler, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 500, 32));
  const captured: boolean[] = [],
    observed: boolean[] = [],
    resizeHitTest = vi.fn();
  const capture = (event: Event) => captured.push(event.defaultPrevented);
  const listener = (event: Event) => {
    observed.push(event.defaultPrevented);
    if (!event.defaultPrevented) resizeHitTest();
  };
  // Use a cancelable native event: the generic pointer helper omits cancelable.
  const dispatch = (type: string, clientX: number, pointerId = 7) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    act(() => {
      ruler.dispatchEvent(event);
    });
    return event;
  };
  document.addEventListener("pointermove", capture, true);
  document.addEventListener("pointermove", listener);
  try {
    expect(dispatch("pointermove", 50).defaultPrevented).toBe(false);
    dispatch("pointerdown", 50);
    expect(ruler).toHaveAttribute("data-scrubbing", "true");
    const calls = vi.mocked(runtime.transport.seek).mock.calls.length;
    expect(dispatch("pointermove", 150, 9).defaultPrevented).toBe(false);
    expect(runtime.transport.seek).toHaveBeenCalledTimes(calls);
    expect(dispatch("pointermove", 100).defaultPrevented).toBe(true);
    expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 1, rate: 1 });
    dispatch("pointerup", 100);
    expect(dispatch("pointermove", 150).defaultPrevented).toBe(false);
    dispatch("pointerdown", 50);
    dispatch("pointercancel", 50);
    expect(dispatch("pointermove", 100).defaultPrevented).toBe(false);
    expect(ruler).not.toHaveAttribute("data-scrubbing");
    expect(captured).toEqual([false, false, false, false, false]);
    expect(observed).toEqual([false, false, true, false, false]);
    expect(resizeHitTest).toHaveBeenCalledTimes(4);
  } finally {
    document.removeEventListener("pointermove", capture, true);
    document.removeEventListener("pointermove", listener);
    view.unmount();
  }
  expect(runtime.listeners.size).toBe(0);
});

it("clamps captured scrubbing to the visible gutter/actions window and caches geometry until scroll or resize", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "setMotionDuration", duration: { value: 10, rate: 1 } });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  const view = d.mount(
    <div className="motion-timeline-scroll">
      <div className="motion-ruler-line">
        <div className="motion-ruler-label" />
        <TimelineRuler
          transport={runtime.transport}
          duration={10}
          pixelsPerSecond={100}
          left={0}
          width={1000}
          unit="s"
        />
        <div className="motion-timeline-actions" />
      </div>
    </div>,
  );
  const ruler = screen.getByRole("slider"),
    viewport = document.querySelector<HTMLElement>(".motion-timeline-scroll")!,
    gutter = document.querySelector<HTMLElement>(".motion-ruler-label")!,
    actions = document.querySelector<HTMLElement>(".motion-timeline-actions")!;
  const rect = vi
    .spyOn(ruler, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(144, 0, 1000, 32));
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 300));
  vi.spyOn(gutter, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 244, 32));
  const actionRect = vi
    .spyOn(actions, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(750, 0, 250, 32));
  const before = d.engine.getSnapshot();
  act(() => pointer(ruler, "pointerdown", 444));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 3, rate: 1 });
  act(() => pointer(ruler, "pointermove", -3000));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 1, rate: 1 });
  act(() => {
    for (let i = 0; i < 20; i++) pointer(ruler, "pointermove", 12000);
  });
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 6, rate: 1 });
  expect(rect).toHaveBeenCalledOnce();
  expect(actionRect).toHaveBeenCalledOnce();
  rect.mockReturnValue(new DOMRect(44, 0, 1000, 32));
  fireEvent.scroll(viewport);
  act(() => pointer(ruler, "pointermove", -3000));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 2, rate: 1 });
  expect(rect).toHaveBeenCalledTimes(2);
  actionRect.mockReturnValue(new DOMRect(650, 0, 350, 32));
  fireEvent(window, new Event("resize"));
  act(() => pointer(ruler, "pointermove", 12000));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 6, rate: 1 });
  act(() => pointer(ruler, "pointerup", 12000));
  expect(rect).toHaveBeenCalledTimes(3);
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
  expect(runtime.listeners.size).toBe(0);
});

it("releases canceled capture once and ignores hover or later capture loss", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(
    <TimelineRuler
      transport={runtime.transport}
      duration={2}
      pixelsPerSecond={100}
      left={0}
      width={500}
      unit="s"
    />,
  );
  const ruler = screen.getByRole("slider");
  vi.spyOn(ruler, "getBoundingClientRect").mockReturnValue({ left: 0, width: 500 } as DOMRect);
  vi.spyOn(ruler, "hasPointerCapture").mockReturnValue(true);
  const release = vi.spyOn(ruler, "releasePointerCapture");
  fireEvent.pointerMove(ruler, { clientX: 50 });
  expect(runtime.transport.seek).not.toHaveBeenCalled();
  act(() => pointer(ruler, "pointerdown", 100));
  fireEvent.keyDown(ruler, { key: "Escape" });
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 0, rate: 1 });
  expect(release).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith(7);
  const calls = vi.mocked(runtime.transport.seek).mock.calls.length;
  act(() => pointer(ruler, "lostpointercapture", 100));
  act(() => pointer(ruler, "pointermove", 200));
  expect(runtime.transport.seek).toHaveBeenCalledTimes(calls);
});

it("exposes localized time units and bounded ruler ticks without mutating authored data", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  const before = d.engine.getSnapshot();
  d.mount(
    <TimelineRuler
      transport={runtime.transport}
      duration={2}
      pixelsPerSecond={240}
      left={0}
      width={500}
      unit="s"
    />,
  );
  const ruler = screen.getByRole("slider");
  act(() => runtime.update({ time: { value: 1, rate: 2 } }));
  expect(ruler).toHaveAttribute("aria-valuetext", "0.5 s");
  expect(d.engine.getSnapshot()).toBe(before);
});

it("retains a tick's DOM identity when its time survives a zoom", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  const render = (scale: number) => (
    <TimelineRuler
      transport={runtime.transport}
      duration={2}
      pixelsPerSecond={scale}
      left={0}
      width={600}
      unit="ms"
    />
  );
  const view = d.mount(render(120));
  const tick = screen.getByText("1000");
  view.rerender(render(140));
  expect(screen.getByText("1000")).toBe(tick);
  expect(tick).toHaveStyle({ left: "140px" });
});

it("keeps pointer focus unframed and exposes the exact composition-end state and tooltip", async () => {
  const d = setup(),
    user = userEvent.setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(
    <TimelineRuler
      transport={runtime.transport}
      duration={2}
      pixelsPerSecond={100}
      left={0}
      width={500}
      unit="s"
    />,
  );
  const ruler = screen.getByRole("slider");
  vi.spyOn(ruler, "getBoundingClientRect").mockReturnValue({ left: 0, width: 500 } as DOMRect);
  act(() => {
    pointer(ruler, "pointerdown", 200);
    pointer(ruler, "pointerup", 200);
  });
  expect(ruler).toHaveAttribute("data-pointer-focus", "true");
  for (const key of ["Control", "Meta", "Shift", "Alt"]) fireEvent.keyDown(ruler, { key });
  expect(ruler).toHaveAttribute("data-pointer-focus", "true");
  expect(ruler).not.toHaveAttribute("data-scrubbing");
  expect(document.querySelector(".motion-ruler-playhead")).toHaveAttribute("data-at-end", "true");
  const end = screen.getByRole("button", { name: "Fin de la composition" });
  expect(end).toHaveAttribute("data-at-end", "true");
  await user.hover(end);
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Fin de la composition");
  fireEvent.keyDown(ruler, { key: "ArrowLeft" });
  expect(ruler).not.toHaveAttribute("data-pointer-focus");
  expect(document.querySelector(".motion-ruler-playhead")).toHaveAttribute("data-at-end", "false");
});

it("seeks the exact rational end by pointer rather than a rounded UI timestamp", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "setMotionDuration", duration: { value: 1, rate: 3 } });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(
    <TimelineRuler
      transport={runtime.transport}
      duration={1 / 3}
      pixelsPerSecond={300}
      left={0}
      width={500}
      unit="s"
    />,
  );
  const ruler = screen.getByRole("slider");
  vi.spyOn(ruler, "getBoundingClientRect").mockReturnValue({ left: 200, width: 500 } as DOMRect);
  act(() => pointer(ruler, "pointerdown", 300));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 1, rate: 3 });
  expect(document.querySelector(".motion-ruler-playhead")).toHaveAttribute("data-at-end", "true");
  act(() => pointer(ruler, "pointermove", 700));
  expect(runtime.transport.seek).toHaveBeenLastCalledWith({ value: 1, rate: 3 });
  act(() => pointer(ruler, "pointerup", 700));
  expect(runtime.transport.read().time).toEqual({ value: 1, rate: 3 });
});
