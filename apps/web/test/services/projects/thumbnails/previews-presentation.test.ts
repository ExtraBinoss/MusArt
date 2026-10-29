import { afterEach, expect, it, vi } from "vitest";
import { createPage } from "@musart/core";
import { ThumbnailPreviews } from "../../../../src/services/projects/thumbnails/previews";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("coalesces deduplicated and cached fanout into one generation-aware cancellable browser fence", async () => {
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let serial = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++serial, callback);
    return serial;
  });
  const cancel = vi.fn((id: number) => frames.delete(id));
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const add = vi.spyOn(document, "addEventListener"),
    remove = vi.spyOn(document, "removeEventListener");
  const render = vi.fn(async () => ({ blob: new Blob(["pixels"]), width: 96, height: 96 }));
  const ready = vi.fn(),
    page = createPage(),
    listeners = new Set<() => void>();
  const queue = new ThumbnailPreviews(
    { render },
    {
      busy: () => false,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    () => false,
    ready,
  );
  const options = { edge: 96, priority: "visible" as const };
  const first = Promise.all(
    Array.from({ length: 1000 }, () => queue.preview("same", page, {}, options)),
  );
  await vi.advanceTimersByTimeAsync(1);
  await first;
  expect(render).toHaveBeenCalledOnce();
  expect(queue.stats().active).toBe(0);
  expect(queue.hasPriority()).toBe(true);
  expect(frames.size).toBe(1);
  expect(vi.getTimerCount()).toBe(1);
  const draw = () => {
    const [id, callback] = [...frames][0]!;
    frames.delete(id);
    callback(0);
  };
  draw();
  draw();
  await vi.advanceTimersByTimeAsync(1);
  expect(queue.hasPriority()).toBe(true);
  expect(frames.size).toBe(1);
  draw();
  // A delivery between the RAFs extends the opportunity for committing cached images.
  await Promise.all(Array.from({ length: 1000 }, () => queue.preview("same", page, {}, options)));
  expect(render).toHaveBeenCalledOnce();
  expect(frames.size).toBe(1);
  expect(vi.getTimerCount()).toBe(1);
  draw();
  await vi.advanceTimersByTimeAsync(1);
  expect(queue.hasPriority()).toBe(true);
  expect(frames.size).toBe(1);
  draw();
  draw();
  await vi.advanceTimersByTimeAsync(1);
  expect(queue.hasPriority()).toBe(false);
  expect(ready).toHaveBeenCalledTimes(2);
  expect(add.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(3);
  expect(remove.mock.calls.filter(([type]) => type === "visibilitychange")).toHaveLength(3);
  let current = true;
  const stale = queue.preview("same", page, {}, { ...options, isCurrent: () => current });
  current = false;
  await expect(stale).rejects.toMatchObject({ name: "AbortError" });
  expect(frames.size).toBe(0);
  await queue.preview("same", page, {}, options);
  const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  await Promise.resolve();
  expect(queue.hasPriority()).toBe(false);
  expect(frames.size).toBe(0);
  hidden.mockReturnValue("visible");
  await queue.preview("same", page, {}, options);
  expect(frames.size).toBe(1);
  await queue.dispose();
  expect(queue.hasPriority()).toBe(false);
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(listeners.size).toBe(0);
});
