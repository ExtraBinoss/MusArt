import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { expect, it, vi } from "vitest";
import { setup } from "../../../support/ui";
import { makeTransport } from "../support";
import { createTimelineGestures } from "../../../../src/components/motion/gestures";
import { useTimelineLayerDrag } from "../../../../src/components/motion/layer-drag/use-timeline-layer-drag";

it("projects the shared source into a bounded canonical DOM window and restores it when inactive", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
    time: { value: 1, rate: 1 },
    value: 25,
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    runtime = makeTransport(page),
    onError = vi.fn();
  const gestures = createTimelineGestures({
    engine: d.engine,
    transport: runtime.transport,
    compositionId: page.id,
    onSelection: vi.fn(),
    onError: vi.fn(),
  });
  const options = {
    engine: d.engine,
    page,
    collapsed: new Set([d.rectangle.id]),
    transport: runtime.transport,
    gestures,
    active: true,
    onError,
  };
  const hook = renderHook((props) => useTimelineLayerDrag(props), { initialProps: options });
  const stable = hook.result.current;
  hook.rerender({ ...options });
  expect(hook.result.current).toBe(stable);
  expect(hook.result.current.native).toBe(stable.native);
  expect(hook.result.current.window).toBe(stable.window);
  expect(hook.result.current.rejectProperty).toBe(stable.rejectProperty);
  const node = document.createElement("div");
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 24));
  const event = {
    currentTarget: node,
    clientX: 100,
    clientY: 2,
    altKey: false,
    preventDefault: vi.fn(),
    nativeEvent: new Event("dragstart"),
    dataTransfer: {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      getData: () => d.rectangle.id,
      effectAllowed: "",
      dropEffect: "",
    },
  } as unknown as DragEvent<HTMLElement>;
  expect(hook.result.current.rows).toHaveLength(3);
  const before = d.engine.getSnapshot();
  act(() => hook.result.current.native.start(event, d.rectangle));
  act(() => hook.result.current.native.over(event, d.text));
  expect(hook.result.current.rows.map((row) => row.layer.id)).toEqual([
    d.image.id,
    d.text.id,
    d.rectangle.id,
  ]);
  const window = hook.result.current.window(0, 1);
  expect(window).toHaveLength(2);
  expect(window.map(({ entry }) => entry.layer.id)).toEqual([d.image.id, d.rectangle.id]);
  expect(hook.result.current.moving).toBe(true);
  hook.rerender({ ...options, active: false });
  expect(hook.result.current.moving).toBe(false);
  expect(hook.result.current.rows).toBe(hook.result.current.canonical);
  expect(d.engine.getSnapshot()).toBe(before);
  hook.unmount();
  gestures.dispose();
});

it("rejects property-row targets without letting the parent viewport accept an old candidate", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = d.engine.getSnapshot().project.pages[0]!,
    runtime = makeTransport(page);
  const gestures = createTimelineGestures({
    engine: d.engine,
    transport: runtime.transport,
    compositionId: page.id,
    onSelection: vi.fn(),
    onError: vi.fn(),
  });
  const hook = renderHook(() =>
    useTimelineLayerDrag({
      engine: d.engine,
      page,
      collapsed: new Set(),
      transport: runtime.transport,
      gestures,
      active: true,
      onError: vi.fn(),
    }),
  );
  const event = {
    stopPropagation: vi.fn(),
    dataTransfer: { dropEffect: "move" },
  } as unknown as DragEvent<HTMLElement>;
  act(() => hook.result.current.rejectProperty(event, d.text.id));
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(event.dataTransfer.dropEffect).toBe("none");
  hook.unmount();
  gestures.dispose();
});
