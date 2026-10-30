import { afterEach, expect, it, vi } from "vitest";
import {
  clearDropPlacement,
  showDropPlacement,
} from "../../../../src/components/shared/dnd/placement";
import { DeferredDragSession } from "../../../../src/components/shared/dnd/session";

function fixture() {
  vi.useFakeTimers();
  const target = document.createElement("div");
  document.body.append(target);
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 50, 100, 30));
  let current = true;
  const stop = vi.fn();
  let listener = () => {};
  return {
    target,
    stop,
    invalidate() {
      current = false;
      listener();
    },
    options: {
      targets: () => [target],
      isCurrent: () => current,
      subscribe: (next: () => void) => {
        listener = next;
        return stop;
      },
    },
  };
}
afterEach(() => {
  clearDropPlacement();
  vi.useRealTimers();
  document.body.replaceChildren();
});
it("decorates committed bounds for exactly one second, following scroll without moving content", () => {
  const d = fixture();
  showDropPlacement(d.options);
  expect(document.querySelector(".dnd-placement-halo")).toBeNull();
  vi.advanceTimersToNextFrame();
  const halo = document.querySelector<HTMLElement>(".dnd-placement-halo")!;
  expect(halo.style.top).toBe("50px");
  expect(halo.style.width).toBe("100px");
  expect(d.target.style.cssText).toBe("");
  vi.mocked(d.target.getBoundingClientRect).mockReturnValue(new DOMRect(20, 80, 100, 30));
  window.dispatchEvent(new Event("scroll"));
  expect(halo.style.top).toBe("80px");
  vi.advanceTimersByTime(999);
  expect(halo.isConnected).toBe(true);
  vi.advanceTimersByTime(1);
  expect(halo.isConnected).toBe(false);
  expect(d.stop).toHaveBeenCalledOnce();
});
it("cancels stale, superseded and page-hidden feedback and releases subscriptions", () => {
  const d = fixture();
  showDropPlacement(d.options);
  d.invalidate();
  vi.advanceTimersToNextFrame();
  expect(document.querySelector(".dnd-placement-halo")).toBeNull();
  const next = fixture();
  showDropPlacement(next.options);
  vi.advanceTimersToNextFrame();
  const oldHalo = document.querySelector(".dnd-placement-halo")!;
  const session = new DeferredDragSession<string>();
  session.begin(() => session.cancel());
  expect(oldHalo.isConnected).toBe(false);
  session.cancel();
  showDropPlacement(next.options);
  vi.advanceTimersToNextFrame();
  window.dispatchEvent(new Event("pagehide"));
  expect(document.querySelector(".dnd-placement-halo")).toBeNull();
});
it("never signals a cancelled, rejected or throwing commit", () => {
  const d = fixture();
  const session = new DeferredDragSession<string>();
  const commit = vi.fn((placed: typeof showDropPlacement) => placed(d.options));
  session.begin(() => session.cancel());
  session.publish("source");
  session.finish(false, commit);
  expect(commit).not.toHaveBeenCalled();
  session.begin(() => session.cancel());
  session.publish("source");
  expect(() =>
    session.finish(true, () => {
      throw new Error("Commit failed");
    }),
  ).toThrow("Commit failed");
  vi.advanceTimersToNextFrame();
  expect(document.querySelector(".dnd-placement-halo")).toBeNull();
});
it("removes the halo and observers when its rendered target unmounts", async () => {
  const d = fixture();
  showDropPlacement(d.options);
  vi.advanceTimersToNextFrame();
  expect(document.querySelector(".dnd-placement-halo")).not.toBeNull();
  d.target.remove();
  await Promise.resolve();
  expect(document.querySelector(".dnd-placement-halo")).toBeNull();
  expect(d.stop).toHaveBeenCalledOnce();
});
