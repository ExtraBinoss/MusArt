import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { createElement, useLayoutEffect, type ReactNode } from "react";
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

test("same-owner canonical values publish urgently while owner or asset changes still defer", () => {
  const store = createStore(),
    assets = {},
    otherAssets = {},
    commits: unknown[] = [];
  const initial = { target: "a", assets, revision: 0 };
  const sameOwner = (before: typeof initial, after: typeof initial) =>
    before.target === after.target && before.assets === after.assets;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store }, children);
  const view = renderHook(
    ({ value }) => {
      const shown = useAttachmentPresentation(value, sameOwner);
      useLayoutEffect(() => {
        commits.push(shown);
      });
      return shown;
    },
    { initialProps: { value: initial }, wrapper },
  );
  commits.length = 0;
  const committed = { ...initial, revision: 1 };
  view.rerender({ value: committed });
  expect(view.result.current).toBe(committed);
  expect(commits.length).toBeGreaterThan(0);
  expect(commits.every((value) => value === committed)).toBe(true);
  commits.length = 0;
  const changedOwner = { ...committed, target: "b" };
  view.rerender({ value: changedOwner });
  expect(commits[0]).toBe(committed);
  expect(view.result.current).toBe(changedOwner);
  commits.length = 0;
  const changedAssets = { ...changedOwner, assets: otherAssets };
  view.rerender({ value: changedAssets });
  expect(commits[0]).toBe(changedOwner);
  expect(view.result.current).toBe(changedAssets);
});

test("same-owner urgency never bypasses an active attachment editing lease", () => {
  const store = createStore(),
    initial = { owner: "same", revision: 0 };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store }, children);
  const view = renderHook(
    ({ value }) => ({
      shown: useAttachmentPresentation(value, (before, after) => before.owner === after.owner),
      owner: usePopoverOwner("effect"),
    }),
    { initialProps: { value: initial }, wrapper },
  );
  act(() => {
    view.result.current.owner.onOpenChange(true);
  });
  const committed = { ...initial, revision: 1 };
  view.rerender({ value: committed });
  expect(view.result.current.shown).toBe(initial);
  act(() => {
    view.result.current.owner.onOpenChange(false);
  });
  expect(view.result.current.shown).toBe(committed);
});
