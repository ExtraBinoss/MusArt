import { expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePopoverOwner } from "../../../../src/components/layers/attachments/use-popover-owner";
import { createElement, type ReactNode } from "react";
import { Provider, createStore } from "jotai";
import { fireEvent, screen } from "@testing-library/react";
import { createEffect } from "@musart/core";
import { setup } from "../../../support/ui";
import { useEngine, previewAtom } from "../../../../src/state/session/editor";
import { EffectPopover } from "../../../../src/components/layers/attachments/EffectPopover";
import { MaskPopover } from "../../../../src/components/layers/attachments/MaskPopover";

function scope(store = createStore()) {
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children);
}

test("recycled owners close their editor and reject stale open/close/focus callbacks", () => {
  const view = renderHook(({ owner }) => usePopoverOwner(owner), {
    initialProps: { owner: "first" },
  });
  expect(view.result.current.open).toBe(false);
  act(() => {
    expect(view.result.current.onOpenChange(true)).toBe(true);
  });
  expect(view.result.current.open).toBe(true);
  const stale = view.result.current;
  view.rerender({ owner: "second" });
  expect(view.result.current.open).toBe(false);
  act(() => {
    expect(stale.onOpenChange(true)).toBe(false);
  });
  const oldFocus = { preventDefault: vi.fn() };
  stale.onCloseAutoFocus(oldFocus);
  expect(oldFocus.preventDefault).toHaveBeenCalledOnce();
  const reboundFocus = { preventDefault: vi.fn() };
  view.result.current.onCloseAutoFocus(reboundFocus);
  expect(reboundFocus.preventDefault).toHaveBeenCalledOnce();
  act(() => {
    view.result.current.onOpenChange(true);
  });
  const currentFocus = { preventDefault: vi.fn() };
  view.result.current.onCloseAutoFocus(currentFocus);
  expect(currentFocus.preventDefault).not.toHaveBeenCalled();
  act(() => {
    view.result.current.onOpenChange(false);
  });
  expect(view.result.current.open).toBe(false);
  const disposed = view.result.current;
  view.unmount();
  expect(disposed.onOpenChange(true)).toBe(false);
});
test("effects, masks and duplicate instances share one open lease and cancel before pointer handoff", () => {
  const view = renderHook(
    () => ({
      effect: usePopoverOwner("effect"),
      duplicate: usePopoverOwner("effect"),
      mask: usePopoverOwner("mask"),
    }),
    { wrapper: scope() },
  );
  const cancel = vi.fn();
  act(() => {
    view.result.current.effect.onOpenChange(true);
    view.result.current.effect.registerDeactivate(cancel);
  });
  const retired = view.result.current.effect;
  act(() => view.result.current.mask.onTriggerPointerDown({ button: 0, ctrlKey: false }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(view.result.current.effect.open).toBe(false);
  expect(view.result.current.effect.present).toBe(false);
  expect(retired.isCurrent()).toBe(false);
  expect(view.result.current.mask.open).toBe(false);
  act(() => {
    view.result.current.mask.onOpenChange(true);
  });
  expect(view.result.current.mask.isCurrent()).toBe(true);
  act(() => {
    expect(retired.onOpenChange(false)).toBe(false);
  });
  expect(view.result.current.mask.open).toBe(true);
  act(() => {
    view.result.current.duplicate.onOpenChange(true);
  });
  expect(view.result.current.duplicate.open).toBe(true);
  expect(view.result.current.effect.open).toBe(false);
  expect(view.result.current.mask.present).toBe(false);
  act(() => {
    view.result.current.duplicate.onOpenChange(false);
  });
  expect(view.result.current.duplicate.open).toBe(false);
  expect(view.result.current.duplicate.present).toBe(true);
});
test("closing a retired lease cannot steal focus and independent Provider stores remain isolated", () => {
  const first = renderHook(() => usePopoverOwner("effect"), { wrapper: scope() });
  const second = renderHook(() => usePopoverOwner("mask"), { wrapper: scope() });
  act(() => {
    first.result.current.onOpenChange(true);
  });
  act(() => {
    second.result.current.onOpenChange(true);
  });
  expect(first.result.current.open).toBe(true);
  expect(second.result.current.open).toBe(true);
  const cancel = vi.fn();
  act(() => {
    first.result.current.registerDeactivate(cancel);
  });
  first.unmount();
  expect(cancel).toHaveBeenCalledOnce();
  expect(second.result.current.open).toBe(true);
  const outside = document.createElement("button"),
    content = document.createElement("div");
  document.body.append(outside, content);
  outside.focus();
  const event = { target: content, preventDefault: vi.fn() };
  second.result.current.onCloseAutoFocus(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  outside.remove();
  content.remove();
});
test("opening another card rerenders only the old and new instances among thirty owners", () => {
  const wrapper = scope();
  const renders = Array.from({ length: 30 }, () => vi.fn());
  const cards = renders.map((render, index) =>
    renderHook(
      () => {
        render();
        return usePopoverOwner(`effect-${index}`);
      },
      { wrapper },
    ),
  );
  renders.forEach((render) => render.mockClear());
  act(() => {
    cards[0]!.result.current.onOpenChange(true);
  });
  expect(renders[0]).toHaveBeenCalled();
  expect(renders.slice(1).every((render) => render.mock.calls.length === 0)).toBe(true);
  renders.forEach((render) => render.mockClear());
  act(() => {
    cards[1]!.result.current.onOpenChange(true);
  });
  expect(renders[0]).toHaveBeenCalled();
  expect(renders[1]).toHaveBeenCalled();
  expect(renders.slice(2).every((render) => render.mock.calls.length === 0)).toBe(true);
  cards[0]!.unmount();
  expect(cards[1]!.result.current.open).toBe(true);
});
test("replacement cancels an actual effect draft, rejects its late command and shares the slot with masks", () => {
  const d = setup(),
    effect = createEffect("dither"),
    other = createEffect("contrast");
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id],
    patch: { effects: [effect, other] },
  });
  d.engine.execute({ type: "attachLayerMask", sourceId: d.text.id, targetId: d.rectangle.id });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const snapshot = useEngine(d.engine),
      page = snapshot.project.pages[0]!;
    const layer = page.layers.find((item) => item.id === d.rectangle.id)!;
    const effectCard = (label: string, id: string) =>
      createElement(EffectPopover, {
        engine: d.engine,
        page,
        layer,
        effectId: id,
        run: d.run,
        children: createElement("button", null, label),
      });
    return createElement(
      "div",
      null,
      effectCard("FX avatar", effect.id),
      effectCard("FX row", effect.id),
      effectCard("Other FX", other.id),
      createElement(MaskPopover, {
        engine: d.engine,
        page,
        layer,
        run: d.run,
        children: createElement("button", null, "Mask"),
      }),
    );
  }
  d.mount(createElement(Live));
  const original = d.engine.getSnapshot().project;
  fireEvent.click(screen.getByRole("button", { name: "FX avatar" }));
  const amount = screen.getByRole("textbox", { name: "Intensité" });
  fireEvent.change(amount, { target: { value: "30" } });
  expect(d.store.get(previewAtom)).not.toBeNull();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Mask" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.blur(amount);
  fireEvent.click(screen.getByRole("button", { name: "Mask" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(d.engine.getSnapshot().project).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: "FX row" }));
  expect(screen.getByRole("textbox", { name: "Intensité" })).toHaveValue("100");
  let late!: () => void;
  d.run.mockImplementationOnce((task) => {
    late = task;
  });
  const next = screen.getByRole("textbox", { name: "Intensité" });
  fireEvent.change(next, { target: { value: "45" } });
  fireEvent.blur(next);
  fireEvent.click(screen.getByRole("button", { name: "FX avatar" }));
  act(() => late());
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "FX avatar" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByRole("button", { name: "FX row" })).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Other FX" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
