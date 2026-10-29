import { createElement, createRef, Profiler, useRef } from "react";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useResetFeedback } from "../../../src/components/shared/use-reset-feedback";

function animation(name = "reset-feedback-pulse") {
  return {
    animationName: name,
    currentTime: 180,
    play: vi.fn(),
    cancel: vi.fn(),
  };
}
function nodeWith(...animations: ReturnType<typeof animation>[]) {
  const node = document.createElement("div");
  node.className = "reset-feedback";
  const getAnimations = vi.fn(() => animations as unknown as Animation[]);
  Object.defineProperty(node, "getAnimations", { value: getAnimations });
  return { node, getAnimations };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("replays only the shared CSS animation and extends one owned cleanup deadline", () => {
  const pulse = animation(),
    unrelated = animation("another-animation"),
    { node } = nodeWith(unrelated, pulse),
    ref = createRef<HTMLElement>();
  ref.current = node;
  const view = renderHook(() => useResetFeedback(ref));
  view.result.current();
  expect(node).toHaveAttribute("data-resetting");
  expect(pulse.currentTime).toBe(0);
  expect(pulse.play).toHaveBeenCalledOnce();
  expect(unrelated.play).not.toHaveBeenCalled();
  vi.advanceTimersByTime(120);
  pulse.currentTime = 120;
  view.result.current();
  expect(pulse.currentTime).toBe(0);
  expect(pulse.play).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(359);
  expect(node).toHaveAttribute("data-resetting");
  vi.advanceTimersByTime(1);
  expect(node).not.toHaveAttribute("data-resetting");
  expect(pulse.cancel).toHaveBeenCalledOnce();
  expect(unrelated.cancel).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
});

test("restarts an already-finished non-filling CSS animation before its attribute cleanup", () => {
  const pulse = animation(),
    { node, getAnimations } = nodeWith(pulse),
    ref = createRef<HTMLElement>();
  ref.current = node;
  const view = renderHook(() => useResetFeedback(ref));
  view.result.current();
  vi.advanceTimersByTime(330);
  getAnimations.mockReturnValue([]);
  pulse.currentTime = 320;
  view.result.current();
  expect(pulse.currentTime).toBe(0);
  expect(pulse.play).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(30);
  expect(node).toHaveAttribute("data-resetting");
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(node).not.toHaveAttribute("data-resetting");
  expect(pulse.cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test("releases the previous element and animation when a visual target is replaced", () => {
  const oldAnimation = animation(),
    freshAnimation = animation(),
    old = nodeWith(oldAnimation),
    fresh = nodeWith(freshAnimation),
    ref = createRef<HTMLElement>();
  ref.current = old.node;
  const view = renderHook(() => useResetFeedback(ref));
  view.result.current();
  ref.current = fresh.node;
  view.result.current();
  expect(old.node).not.toHaveAttribute("data-resetting");
  expect(oldAnimation.cancel).toHaveBeenCalledOnce();
  expect(fresh.node).toHaveAttribute("data-resetting");
  expect(freshAnimation.play).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(freshAnimation.cancel).toHaveBeenCalledOnce();
  expect(fresh.node).not.toHaveAttribute("data-resetting");
  const afterUnmount = view.result.current;
  afterUnmount();
  expect(vi.getTimerCount()).toBe(0);
});

test("handles absent targets and animation APIs without retaining an unmounted pulse", () => {
  const ref = createRef<HTMLElement>(),
    view = renderHook(() => useResetFeedback(ref));
  view.result.current();
  expect(vi.getTimerCount()).toBe(0);
  const node = document.createElement("div");
  ref.current = node;
  view.result.current();
  expect(node).toHaveAttribute("data-resetting");
  view.unmount();
  expect(node).not.toHaveAttribute("data-resetting");
  expect(vi.getTimerCount()).toBe(0);
});

test("rebinds a replacement CSS animation and changes no React state", () => {
  const first = animation(),
    second = animation(),
    renders = vi.fn();
  function Host() {
    const ref = useRef<HTMLDivElement>(null),
      feedback = useResetFeedback(ref);
    return createElement("div", { ref, role: "button", onDoubleClick: feedback }, "Reset");
  }
  const view = render(
    createElement(Profiler, { id: "feedback", onRender: renders }, createElement(Host)),
  );
  const node = screen.getByRole("button", { name: "Reset" });
  const getAnimations = vi.fn(() => [first] as unknown as Animation[]);
  Object.defineProperty(node, "getAnimations", { value: getAnimations });
  const baseline = renders.mock.calls.length;
  fireEvent.doubleClick(node);
  getAnimations.mockReturnValue([second] as unknown as Animation[]);
  fireEvent.doubleClick(node);
  expect(first.cancel).toHaveBeenCalledOnce();
  expect(second.play).toHaveBeenCalledOnce();
  expect(renders).toHaveBeenCalledTimes(baseline);
  view.unmount();
  expect(second.cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
