import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { createElement, type ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { useAttachmentPresentation } from "../../../src/components/shared/use-attachment-presentation";
import { usePopoverOwner } from "../../../src/components/layers/attachments/use-popover-owner";

test("attachment editing retains secondary presentation and dismissal adopts only the latest value", () => {
  const store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store }, children);
  const initial = { selected: "previous" },
    next = { selected: "effect" },
    latest = { selected: "latest" };
  const view = renderHook(
    ({ value }) => ({
      shown: useAttachmentPresentation(value),
      owner: usePopoverOwner("effect"),
      other: usePopoverOwner("mask"),
    }),
    { initialProps: { value: initial }, wrapper },
  );
  expect(view.result.current.shown).toBe(initial);
  act(() => {
    view.result.current.owner.onOpenChange(true);
  });
  view.rerender({ value: next });
  expect(view.result.current.shown).toBe(initial);
  act(() => {
    view.result.current.other.onOpenChange(true);
  });
  view.rerender({ value: latest });
  expect(view.result.current.shown).toBe(initial);
  act(() => {
    view.result.current.other.onOpenChange(false);
  });
  expect(view.result.current.shown).toBe(latest);
  view.rerender({ value: initial });
  expect(view.result.current.shown).toBe(initial);
});

test("function values are retained without invoking them and unmount retires an open session", () => {
  const first = vi.fn(),
    next = vi.fn(),
    store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store }, children);
  const owner = renderHook(() => usePopoverOwner("effect"), { wrapper });
  const view = renderHook(({ value }) => useAttachmentPresentation(value), {
    initialProps: { value: first },
    wrapper,
  });
  act(() => {
    owner.result.current.onOpenChange(true);
  });
  view.rerender({ value: next });
  expect(view.result.current).toBe(first);
  act(() => owner.unmount());
  expect(view.result.current).toBe(next);
  expect(first).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});
