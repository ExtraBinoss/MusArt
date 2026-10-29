import { expect, test, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { createElement, StrictMode, useLayoutEffect } from "react";
import { useLayerPopoverAnchor } from "../../../../src/components/layers/attachments/use-layer-popover-anchor";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "../../../../src/components/ui/popover";
import { Button } from "../../../../src/components/ui/button";

function fixture(className = "layer-row") {
  const row = document.createElement("div"),
    button = document.createElement("button");
  row.className = className;
  row.append(button);
  document.body.append(row);
  const bounds = new DOMRect(1280, 700, 320, 36),
    triggerBounds = new DOMRect(1488, 703, 30, 30),
    measureRow = vi.spyOn(row, "getBoundingClientRect").mockReturnValue(bounds),
    measureTrigger = vi.spyOn(button, "getBoundingClientRect").mockReturnValue(triggerBounds),
    view = renderHook(({ ownerKey }) => useLayerPopoverAnchor(ownerKey), {
      initialProps: { ownerKey: "owner", open: false },
    });
  act(() => view.result.current.trigger(button));
  return { row, button, bounds, triggerBounds, measureRow, measureTrigger, view };
}

test.each(["layer-row", "layer-attachment-row"])(
  "stable owner geometry measures its complete %s and survives ordinary open/close rerenders",
  (className) => {
    const d = fixture(className),
      anchor = d.view.result.current.virtualRef;
    try {
      expect(d.measureRow).not.toHaveBeenCalled();
      expect(d.measureTrigger).not.toHaveBeenCalled();
      d.view.rerender({ ownerKey: "owner", open: true });
      expect(d.view.result.current.virtualRef).toBe(anchor);
      expect(anchor.current.getBoundingClientRect()).toBe(d.bounds);
      expect(anchor.current.contextElement).toBe(d.row);
      expect(d.measureRow).toHaveBeenCalledOnce();
      expect(d.measureTrigger).not.toHaveBeenCalled();
      d.view.rerender({ ownerKey: "owner", open: false });
      expect(d.view.result.current.virtualRef).toBe(anchor);
      expect(d.measureRow).toHaveBeenCalledOnce();
    } finally {
      d.view.unmount();
      d.row.remove();
    }
  },
);

test("an open standalone trigger is the fallback only when it has no owner row", () => {
  const d = fixture("standalone");
  try {
    expect(d.view.result.current.virtualRef.current.getBoundingClientRect()).toBe(d.triggerBounds);
    expect(d.measureTrigger).toHaveBeenCalledOnce();
    expect(d.measureRow).not.toHaveBeenCalled();
  } finally {
    d.view.unmount();
    d.row.remove();
  }
});

test("a disconnected trigger and an unmounted hook cannot read or retain old row geometry", () => {
  const d = fixture();
  const anchor = d.view.result.current.virtualRef;
  d.row.remove();
  expect(anchor.current.getBoundingClientRect()).toEqual(new DOMRect());
  expect(anchor.current.contextElement).toBeUndefined();
  document.body.append(d.row);
  d.view.unmount();
  try {
    expect(anchor.current.getBoundingClientRect()).toEqual(new DOMRect());
    expect(anchor.current.contextElement).toBeUndefined();
    expect(d.measureRow).not.toHaveBeenCalled();
    expect(d.measureTrigger).not.toHaveBeenCalled();
  } finally {
    d.row.remove();
  }
});

test("a new owner supplies real row geometry before its first parent layout effect", () => {
  const bounds = new DOMRect(1280, 700, 320, 36);
  let parentReady = false;
  const observed: { beforeParent: boolean; bounds: DOMRect }[] = [];
  const read = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(bounds);
  function Probe({ anchor }: { anchor: ReturnType<typeof useLayerPopoverAnchor> }) {
    const { virtualRef } = anchor;
    useLayoutEffect(() => {
      observed.push({
        beforeParent: !parentReady,
        bounds: virtualRef.current.getBoundingClientRect(),
      });
    }, [virtualRef]);
    return null;
  }
  function Owner() {
    const { trigger, virtualRef } = useLayerPopoverAnchor("owner");
    useLayoutEffect(() => {
      parentReady = true;
    }, []);
    return createElement(
      "div",
      { className: "layer-row" },
      createElement("button", { ref: trigger }),
      createElement(Probe, { anchor: { trigger, virtualRef } }),
    );
  }
  const view = render(createElement(Owner));
  try {
    expect(observed[0]).toEqual({ beforeParent: true, bounds });
    expect(read).toHaveBeenCalled();
  } finally {
    view.unmount();
    read.mockRestore();
  }
});

test("recycling an owner retires its old reference before measuring the replacement row", () => {
  const d = fixture(),
    nextRow = document.createElement("div"),
    nextTrigger = document.createElement("button"),
    nextBounds = new DOMRect(1280, 736, 320, 36);
  nextRow.className = "layer-attachment-row";
  nextRow.append(nextTrigger);
  document.body.append(nextRow);
  const measure = vi.spyOn(nextRow, "getBoundingClientRect").mockReturnValue(nextBounds);
  try {
    const retired = d.view.result.current.virtualRef;
    d.view.rerender({ ownerKey: "replacement", open: false });
    act(() => d.view.result.current.trigger(nextTrigger));
    const anchor = d.view.result.current.virtualRef;
    expect(anchor).not.toBe(retired);
    expect(retired.current.getBoundingClientRect()).toEqual(new DOMRect());
    expect(retired.current.contextElement).toBeUndefined();
    expect(anchor.current.getBoundingClientRect()).toBe(nextBounds);
    expect(anchor.current.contextElement).toBe(nextRow);
    expect(measure).toHaveBeenCalledOnce();
    expect(d.measureRow).not.toHaveBeenCalled();
    act(() => d.view.result.current.trigger(null));
    expect(d.view.result.current.virtualRef.current.getBoundingClientRect()).toEqual(new DOMRect());
    expect(d.view.result.current.virtualRef.current.contextElement).toBeUndefined();
  } finally {
    d.view.unmount();
    d.row.remove();
    nextRow.remove();
  }
});

test("an actual trigger DOM replacement republishes geometry without changing the owner or open state", () => {
  const d = fixture(),
    next = document.createElement("button"),
    callback = d.view.result.current.trigger,
    original = d.view.result.current.virtualRef;
  d.row.append(next);
  d.button.remove();
  try {
    act(() => callback(next));
    const replacement = d.view.result.current.virtualRef;
    expect(replacement).not.toBe(original);
    expect(d.view.result.current.trigger).toBe(callback);
    expect(replacement.current.contextElement).toBe(d.row);
    expect(replacement.current.getBoundingClientRect()).toBe(d.bounds);
    d.view.rerender({ ownerKey: "owner", open: true });
    d.view.rerender({ ownerKey: "owner", open: false });
    expect(d.view.result.current.virtualRef).toBe(replacement);
  } finally {
    d.view.unmount();
    d.row.remove();
  }
});

test("StrictMode genuine Radix asChild Buttons retain real row geometry after DOM replacement and resize", async () => {
  let facade: ReturnType<typeof useLayerPopoverAnchor>["virtualRef"] | undefined;
  function Card({ open, generation }: { open: boolean; generation: number }) {
    const { trigger, virtualRef } = useLayerPopoverAnchor("strict-owner");
    useLayoutEffect(() => {
      facade = virtualRef;
    }, [virtualRef]);
    return createElement(
      Popover,
      { open },
      createElement(
        "div",
        { className: "layer-row" },
        createElement(PopoverAnchor, { virtualRef }),
        createElement(
          PopoverTrigger,
          { ref: trigger, asChild: true },
          createElement(Button, { key: generation }, "Effect trigger"),
        ),
      ),
      createElement(PopoverContent, { portalContainer: document.body }, "Editor"),
    );
  }
  const content = (open: boolean, generation: number) =>
    createElement(StrictMode, null, createElement(Card, { open, generation }));
  const view = render(content(false, 0)),
    row = view.container.querySelector<HTMLElement>(".layer-row")!,
    bounds = new DOMRect(1280, 700, 320, 36),
    measure = vi.spyOn(row, "getBoundingClientRect").mockReturnValue(bounds),
    firstButton = view.getByRole("button", { name: "Effect trigger" }),
    firstFacade = facade!;
  try {
    expect(firstFacade.current.contextElement).toBe(row);
    expect(firstFacade.current.getBoundingClientRect()).toBe(bounds);
    view.rerender(content(false, 1));
    expect(firstButton.isConnected).toBe(false);
    expect(facade).not.toBe(firstFacade);
    expect(facade!.current.contextElement).toBe(row);
    const current = facade!;
    view.rerender(content(true, 1));
    expect(await view.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(facade).toBe(current));
    const resized = new DOMRect(1100, 700, 500, 36);
    measure.mockReturnValue(resized);
    expect(current.current.contextElement).toBe(row);
    expect(current.current.getBoundingClientRect()).toBe(resized);
    view.unmount();
    expect(current.current.getBoundingClientRect()).toEqual(new DOMRect());
    expect(current.current.contextElement).toBeUndefined();
  } finally {
    view.unmount();
  }
});

test("a genuine closed Radix card installs its stable anchor without any automatic layout read", () => {
  const read = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
  function Card() {
    const { trigger, virtualRef } = useLayerPopoverAnchor("closed-owner");
    return createElement(
      Popover,
      { open: false },
      createElement(
        "div",
        { className: "layer-row" },
        createElement(PopoverAnchor, { virtualRef }),
        createElement(PopoverTrigger, { ref: trigger }, "Closed effect"),
      ),
      createElement(PopoverContent, { portalContainer: document.body }, "Editor"),
    );
  }
  const view = render(createElement(Card));
  try {
    expect(view.queryByRole("dialog")).toBeNull();
    expect(view.getByRole("button", { name: "Closed effect" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(read).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    read.mockRestore();
  }
});
