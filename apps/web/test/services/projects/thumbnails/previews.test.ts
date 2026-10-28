import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPage, type Asset, type Composition } from "@musart/core";
import {
  ThumbnailPreviews,
  type ThumbnailPreview,
} from "../../../../src/services/projects/thumbnails/previews";
import { ThumbnailActivity } from "../../../../src/services/projects/thumbnails/activity";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function fixture() {
  let busy = false,
    foreground = false;
  const listeners = new Set<() => void>(),
    activity = {
      busy: () => busy,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      set: (next: boolean) => {
        busy = next;
        for (const listener of listeners) listener();
      },
    };
  const result = (bytes = 20): ThumbnailPreview => ({
    blob: new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
    width: 96,
    height: 64,
  });
  const render = vi.fn<
      (
        page: Composition,
        assets: Record<string, Asset>,
        canRender?: () => boolean,
        edge?: number,
      ) => Promise<ThumbnailPreview>
    >(async () => result()),
    renderer = { render },
    queue = new ThumbnailPreviews(renderer, activity, () => foreground);
  return {
    queue,
    render,
    result,
    activity,
    listeners,
    setForeground: (next: boolean) => {
      foreground = next;
      queue.wake();
    },
    page: createPage({ width: 300, height: 200 }),
  };
}
it("deduplicates current consumers, caches blobs with edge identity and rechecks cached microtask results", async () => {
  const d = fixture();
  d.activity.set(true);
  const abort = new AbortController(),
    first = d.queue.preview("same", d.page, {}, { edge: 96, signal: abort.signal }),
    second = d.queue.preview("same", d.page, {}, { edge: 96 });
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  abort.abort();
  await rejected;
  expect(d.queue.stats().pending).toBe(1);
  expect(d.render).not.toHaveBeenCalled();
  d.activity.set(false);
  await vi.runAllTimersAsync();
  const value = await second;
  expect(d.render).toHaveBeenCalledExactlyOnceWith(d.page, {}, expect.any(Function), 96);
  expect(await d.queue.preview("same", d.page, {}, { edge: 96 })).toBe(value);
  expect(d.render).toHaveBeenCalledOnce();
  const different = d.queue.preview("same", d.page, {}, { edge: 384 });
  await vi.runAllTimersAsync();
  await different;
  expect(d.render).toHaveBeenCalledTimes(2);
  let current = true;
  const stale = d.queue.preview("same", d.page, {}, { edge: 96, isCurrent: () => current });
  current = false;
  await expect(stale).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    d.queue.preview("already-aborted", d.page, {}, { signal: abort.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  await expect(d.queue.preview("", d.page, {})).rejects.toThrow("Invalid");
  await expect(d.queue.preview("bad-edge", d.page, {}, { edge: 769 })).rejects.toThrow("Invalid");
  await d.queue.dispose();
  expect(d.listeners.size).toBe(0);
  await expect(d.queue.preview("closed", d.page, {})).rejects.toMatchObject({ name: "AbortError" });
});
it("defers behind canonical work and gestures, retries preparation deferral and preserves current waiters", async () => {
  const d = fixture();
  d.setForeground(true);
  const first = d.queue.preview("first", d.page, {}),
    secondPage = { ...d.page, id: "second" },
    second = d.queue.preview("second", secondPage, {});
  await vi.runAllTimersAsync();
  expect(d.render).not.toHaveBeenCalled();
  let reject!: (error: unknown) => void;
  d.render.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  d.setForeground(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(d.render).toHaveBeenCalledOnce();
  const canRender = d.render.mock.calls[0]![2] as unknown as () => boolean;
  d.activity.set(true);
  expect(canRender()).toBe(false);
  reject(new DOMException("deferred", "AbortError"));
  await Promise.resolve();
  await Promise.resolve();
  expect(d.queue.stats().pending).toBe(2);
  d.activity.set(false);
  await vi.runAllTimersAsync();
  await Promise.all([first, second]);
  expect(d.render.mock.calls.map((args) => (args[0] as unknown as { id: string }).id)).toEqual([
    d.page.id,
    secondPage.id,
    d.page.id,
  ]);
  await d.queue.dispose();
});
it("rejects stale/failed work, permits retry and does not let an aborted active job overwrite its replacement", async () => {
  const d = fixture();
  let complete!: (value: ThumbnailPreview) => void,
    current = true;
  d.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const stale = d.queue.preview("stale", d.page, {}, { isCurrent: () => current });
  const staleRejected = expect(stale).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  current = false;
  complete(d.result());
  await staleRejected;
  expect(d.queue.stats().cacheEntries).toBe(0);
  d.render.mockRejectedValueOnce(new Error("real-render-failure"));
  const failed = d.queue.preview("retry", d.page, {}),
    failure = expect(failed).rejects.toThrow("real-render-failure");
  await vi.runAllTimersAsync();
  await failure;
  const retry = d.queue.preview("retry", d.page, {});
  await vi.runAllTimersAsync();
  await retry;
  d.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const signal = new AbortController(),
    abandoned = d.queue.preview("replacement", d.page, {}, { signal: signal.signal }),
    aborted = expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  signal.abort();
  await aborted;
  const replacement = d.queue.preview("replacement", d.page, {});
  complete(d.result());
  await Promise.resolve();
  await Promise.resolve();
  await vi.runAllTimersAsync();
  await replacement;
  expect(d.queue.stats().pending).toBe(0);
  await d.queue.dispose();
});
it("bounds pending consumers and LRU blob bytes/entries without owning the shared renderer", async () => {
  const d = fixture();
  d.activity.set(true);
  const bounded = Array.from({ length: 40 }, (_unused, index) =>
    d.queue.preview(`pending-${index}`, d.page, {}).then(
      () => "success",
      () => "aborted",
    ),
  );
  expect(d.queue.stats().pending).toBe(32);
  const closing = d.queue.dispose();
  expect(d.queue.dispose()).toBe(closing);
  await closing;
  expect(await Promise.all(bounded)).toEqual(Array(40).fill("aborted"));
  expect(d.render).not.toHaveBeenCalled();
  const cache = fixture();
  for (let index = 0; index < 514; index++) {
    const done = cache.queue.preview(`entry-${index}`, cache.page, {});
    await vi.runAllTimersAsync();
    await done;
  }
  expect(cache.queue.stats().cacheEntries).toBe(512);
  const evicted = cache.queue.preview("entry-0", cache.page, {});
  await vi.runAllTimersAsync();
  await evicted;
  expect(cache.render).toHaveBeenCalledTimes(515);
  cache.render.mockImplementation(async () => cache.result(600000));
  for (let index = 0; index < 20; index++) {
    const done = cache.queue.preview(`large-${index}`, cache.page, {});
    await vi.runAllTimersAsync();
    await done;
  }
  expect(cache.queue.stats().cacheBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  cache.render.mockResolvedValueOnce(cache.result(9 * 1024 * 1024));
  const large = cache.queue.preview("uncacheable", cache.page, {});
  await vi.runAllTimersAsync();
  await large;
  expect(cache.queue.stats().cacheBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  await cache.queue.dispose();
});
it("cancels idle callbacks, drains active jobs after disposal and rejects guard errors", async () => {
  const d = fixture();
  let idle!: IdleRequestCallback;
  const cancel = vi.fn();
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    idle = callback;
    return 9;
  });
  vi.stubGlobal("cancelIdleCallback", cancel);
  const pending = d.queue.preview("idle", d.page, {}),
    aborted = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  d.activity.set(true);
  expect(cancel).toHaveBeenCalledWith(9);
  idle({} as IdleDeadline);
  expect(d.render).not.toHaveBeenCalled();
  await d.queue.dispose();
  await aborted;
  vi.unstubAllGlobals();
  const active = fixture();
  let complete!: (value: ThumbnailPreview) => void;
  active.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const done = active.queue.preview("active", active.page, {}),
    rejected = expect(done).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  let disposed = false;
  const close = active.queue.dispose().then(() => {
    disposed = true;
  });
  await rejected;
  expect(disposed).toBe(false);
  complete(active.result());
  await close;
  expect(active.queue.stats()).toEqual({ pending: 0, active: 0, cacheEntries: 0, cacheBytes: 0 });
  const guarded = fixture();
  await expect(
    guarded.queue.preview(
      "guard",
      guarded.page,
      {},
      {
        isCurrent: () => {
          throw new Error("guard-failed");
        },
      },
    ),
  ).rejects.toThrow("guard-failed");
  await guarded.queue.dispose();
});
it("runs visible rows after release, ahead of background work but behind explicit export", async () => {
  let held = true,
    quiet = true;
  const listeners = new Set<() => void>(),
    render = vi.fn(async () => ({ blob: new Blob(["preview"]), width: 96, height: 64 }));
  const activity = {
    busy: () => quiet,
    interacting: () => held,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const queue = new ThumbnailPreviews({ render }, activity),
    page = createPage();
  const background = queue.preview("background", page, {}, { edge: 96 }),
    visible = queue.preview("visible", page, {}, { edge: 96, priority: "visible" }),
    foreground = queue.preview("export", page, {}, { edge: 384, priority: "foreground" });
  expect(queue.hasPriority()).toBe(true);
  await vi.runAllTimersAsync();
  expect(render).not.toHaveBeenCalled();
  held = false;
  listeners.forEach((listener) => listener());
  await vi.runAllTimersAsync();
  await foreground;
  await visible;
  expect(render).toHaveBeenNthCalledWith(1, page, {}, expect.any(Function), 384);
  expect(render).toHaveBeenNthCalledWith(2, page, {}, expect.any(Function), 96);
  expect(queue.hasPriority()).toBe(false);
  expect(queue.stats().pending).toBe(1);
  quiet = false;
  listeners.forEach((listener) => listener());
  await vi.runAllTimersAsync();
  await background;
  expect(render).toHaveBeenCalledTimes(3);
  await queue.dispose();
});
it("reschedules background work when an idle timeout has no budget while foreground export remains immediate", async () => {
  const d = fixture();
  let idle!: IdleRequestCallback;
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    idle = callback;
    return 1;
  });
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  const background = d.queue.preview("budgeted", d.page, {});
  await vi.advanceTimersByTimeAsync(0);
  idle({ didTimeout: true, timeRemaining: () => 0 });
  expect(d.render).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(0);
  idle({ didTimeout: false, timeRemaining: () => 20 });
  await background;
  expect(d.render).toHaveBeenCalledOnce();
  const foreground = d.queue.preview("explicit-export", d.page, {}, { priority: "foreground" });
  await vi.advanceTimersByTimeAsync(0);
  await foreground;
  expect(d.render).toHaveBeenCalledTimes(2);
  await d.queue.dispose();
});
it("promotes an existing job for a visible consumer and returns cached pixels during live input", async () => {
  let held = true;
  const listeners = new Set<() => void>();
  const render = vi.fn(async () => ({ blob: new Blob(["pixels"]), width: 96, height: 96 }));
  const queue = new ThumbnailPreviews(
    { render },
    {
      busy: () => true,
      interacting: () => held,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  );
  const page = createPage();
  const background = queue.preview("same", page, {}, { edge: 96 });
  const visible = queue.preview("same", page, {}, { edge: 96, priority: "visible" });
  await vi.runAllTimersAsync();
  expect(render).not.toHaveBeenCalled();
  expect(queue.stats().pending).toBe(1);
  held = false;
  listeners.forEach((listener) => listener());
  await vi.runAllTimersAsync();
  const result = await visible;
  expect(await background).toBe(result);
  expect(render).toHaveBeenCalledOnce();
  held = true;
  listeners.forEach((listener) => listener());
  expect(await queue.preview("same", page, {}, { edge: 96, priority: "visible" })).toBe(result);
  expect(render).toHaveBeenCalledOnce();
  await queue.dispose();
  expect(listeners.size).toBe(0);
});
it("visible consumers honor their activity guard while exports retain their separate wheel guard", async () => {
  let visibleBusy = true,
    interacting = true;
  const listeners = new Set<() => void>();
  const render = vi.fn(async () => ({ blob: new Blob(["pixels"]), width: 96, height: 96 }));
  const queue = new ThumbnailPreviews(
    { render },
    {
      busy: () => true,
      interacting: () => interacting,
      visibleBusy: () => visibleBusy,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  );
  const page = createPage();
  const foreground = queue.preview("export", page, {}, { edge: 384, priority: "foreground" });
  const visible = queue.preview("row", page, {}, { edge: 96, priority: "visible" });
  await vi.runAllTimersAsync();
  expect(render).not.toHaveBeenCalled();
  visibleBusy = false;
  listeners.forEach((listener) => listener());
  await vi.runAllTimersAsync();
  await visible;
  expect(render).toHaveBeenCalledExactlyOnceWith(page, {}, expect.any(Function), 96);
  expect(queue.stats().pending).toBe(1);
  interacting = false;
  listeners.forEach((listener) => listener());
  await vi.runAllTimersAsync();
  await foreground;
  expect(render).toHaveBeenNthCalledWith(2, page, {}, expect.any(Function), 384);
  await queue.dispose();
});
it("real held/repeating keys defer queued cold row rendering until keyup even when native input is no longer pending", async () => {
  const activity = new ThumbnailActivity();
  const render = vi.fn(async () => ({ blob: new Blob(["pixels"]), width: 96, height: 96 }));
  const queue = new ThumbnailPreviews({ render }, activity);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight" }));
  const pending = queue.preview("held-row", createPage(), {}, { edge: 96, priority: "visible" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(render).not.toHaveBeenCalled();
  window.dispatchEvent(
    new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", repeat: true }),
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(render).not.toHaveBeenCalled();
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight" }));
  await vi.runAllTimersAsync();
  await pending;
  expect(render).toHaveBeenCalledOnce();
  await queue.dispose();
  activity.dispose();
});

it("overlaps at most two small visible jobs, retains canceled active slots and drains both before closing", async () => {
  const d = fixture();
  const finish = new Map<string, (value: ThumbnailPreview) => void>();
  d.render.mockImplementation(
    (page) =>
      new Promise((resolve) => {
        finish.set(page.id, resolve);
      }),
  );
  const pages = ["one", "two", "three"].map((id) => ({ ...d.page, id }));
  const controller = new AbortController();
  const first = d.queue.preview(
    "one",
    pages[0]!,
    {},
    { edge: 96, priority: "visible", signal: controller.signal },
  );
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  const second = d.queue.preview("two", pages[1]!, {}, { edge: 96, priority: "visible" });
  const third = d.queue.preview("three", pages[2]!, {}, { edge: 96, priority: "visible" });
  await vi.runAllTimersAsync();
  expect(d.render).toHaveBeenCalledTimes(2);
  expect(d.queue.stats()).toMatchObject({ active: 2, pending: 1 });
  controller.abort();
  await rejected;
  expect(d.queue.stats().active).toBe(2);
  finish.get("one")!(d.result());
  await vi.runAllTimersAsync();
  expect(d.render).toHaveBeenCalledTimes(3);
  expect(d.queue.stats()).toMatchObject({ active: 2, pending: 0, cacheEntries: 0 });
  const aborted = [
    expect(second).rejects.toMatchObject({ name: "AbortError" }),
    expect(third).rejects.toMatchObject({ name: "AbortError" }),
  ];
  let closed = false;
  const closing = d.queue.dispose().then(() => {
    closed = true;
  });
  await Promise.all(aborted);
  expect(closed).toBe(false);
  finish.get("two")!(d.result());
  await Promise.resolve();
  expect(closed).toBe(false);
  finish.get("three")!(d.result());
  await closing;
  expect(d.queue.stats().active).toBe(0);
});
it("foreground exports wait for active visible encodes and run before the next row; large/background jobs never overlap", async () => {
  const d = fixture();
  const finish = new Map<string, (value: ThumbnailPreview) => void>();
  d.render.mockImplementation(
    (page) =>
      new Promise((resolve) => {
        finish.set(page.id, resolve);
      }),
  );
  const pages = ["one", "two", "three", "export"].map((id) => ({ ...d.page, id }));
  const pending = pages
    .slice(0, 3)
    .map((page, index) =>
      d.queue.preview(String(index), page, {}, { edge: 96, priority: "visible" }),
    );
  await vi.runAllTimersAsync();
  const foreground = d.queue.preview(
    "export",
    pages[3]!,
    {},
    { edge: 384, priority: "foreground" },
  );
  finish.get("one")!(d.result());
  await vi.runAllTimersAsync();
  expect(d.render).toHaveBeenCalledTimes(2);
  finish.get("two")!(d.result());
  await vi.runAllTimersAsync();
  expect(d.render.mock.calls.map((call) => call[0].id)).toEqual(["one", "two", "export"]);
  finish.get("export")!(d.result());
  await vi.runAllTimersAsync();
  expect(d.render.mock.calls.at(-1)![0].id).toBe("three");
  finish.get("three")!(d.result());
  await vi.runAllTimersAsync();
  await Promise.all([...pending, foreground]);
  await d.queue.dispose();
});
