import { expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePopoverOwner } from "../../../../src/components/layers/attachments/use-popover-owner";

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
