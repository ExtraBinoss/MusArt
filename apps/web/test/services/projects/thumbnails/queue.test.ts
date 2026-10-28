import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  ThumbnailPipeline,
  installThumbnailSchedule,
} from "../../../../src/services/projects/thumbnails/queue";
import { thumbnailRevision } from "../../../../src/services/projects/thumbnails/revision";
import { fixture, record } from "./fixtures";
beforeEach(() => {
  vi.useFakeTimers();
  let next = 0;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:${++next}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
it("borrows the same renderer for current previews after canonical thumbnails and aborts preview consumers on disposal", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, d),
    page = d.project.pages[0]!;
  const disposal = vi.spyOn(d.renderer, "dispose");
  pipeline.schedule(d.project);
  const preview = pipeline.preview("fx:key", page, d.project.assets, { edge: 96 });
  await pipeline.flush();
  expect(d.render).toHaveBeenCalledTimes(2);
  await vi.runAllTimersAsync();
  expect(await preview).toMatchObject({ blob: expect.any(Blob) });
  expect(d.render).toHaveBeenNthCalledWith(3, page, d.project.assets, expect.any(Function), 96);
  d.activity.set(true);
  const abandoned = pipeline.preview("abandoned", page, d.project.assets),
    rejected = expect(abandoned).rejects.toMatchObject({ name: "AbortError" });
  await pipeline.dispose();
  await rejected;
  expect(disposal).toHaveBeenCalledOnce();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("uses the store's owned hash port for background page revisions", async () => {
  const d = fixture();
  const revision = vi.fn(
    (
      page: Parameters<typeof thumbnailRevision>[0],
      assets: Parameters<typeof thumbnailRevision>[1],
    ) => thumbnailRevision(page, assets),
  );
  const pipeline = new ThumbnailPipeline({ ...d.store, thumbnailRevision: revision }, d);
  try {
    pipeline.schedule(d.project);
    await pipeline.flush();
    expect(revision).toHaveBeenCalledTimes(d.project.pages.length);
    expect(revision).toHaveBeenCalledWith(d.project.pages[0], d.project.assets);
  } finally {
    await pipeline.dispose();
  }
});
it("coalesces canonical commits, skips current pages, saves all missing compositions and publishes only durable thumbnails", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, d),
    engine = new EditorEngine(d.project),
    listener = vi.fn();
  const stop = installThumbnailSchedule(engine, pipeline),
    unsubscribe = pipeline.subscribe(listener);
  engine.select([]);
  engine.execute({ type: "renameProject", name: "Latest" });
  await pipeline.flush();
  expect(d.render).toHaveBeenCalledTimes(2);
  expect(d.store.saveThumbnail).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenCalledTimes(2);
  pipeline.schedule(engine.getSnapshot().project);
  await pipeline.flush();
  expect(d.render).toHaveBeenCalledTimes(2);
  unsubscribe();
  stop();
  await pipeline.dispose();
  expect(d.activity.dispose).toHaveBeenCalledOnce();
});
it("missing visible pages never replace a pending canonical all-page snapshot with older disk data", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, d),
    latest = {
      ...d.project,
      pages: d.project.pages.map((page) => ({ ...page, background: "#123456" })),
    };
  pipeline.schedule(latest);
  const lease = await pipeline.acquire(d.project.id, ["two"]);
  lease.release();
  await pipeline.flush();
  expect(d.store.load).not.toHaveBeenCalled();
  expect(d.render).toHaveBeenCalledTimes(2);
  expect(d.render.mock.calls.map(([page]) => page)).toEqual(latest.pages);
  await pipeline.dispose();
});
it("coalesces missing lazy page requests instead of dropping earlier artboards", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, d);
  pipeline.request(d.project.id, ["page"]);
  pipeline.request(d.project.id, ["two"]);
  await pipeline.flush();
  expect(d.store.load).toHaveBeenCalledOnce();
  expect(d.render.mock.calls.map(([page]) => page.id)).toEqual(["page", "two"]);
  await pipeline.dispose();
});
it("a visible-page miss cannot invalidate a canonical render already in progress", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, d);
  let finish!: (value: Awaited<ReturnType<typeof d.renderer.render>>) => void, started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  d.render.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  pipeline.schedule(d.project);
  const flushing = pipeline.flush();
  await ready;
  const lease = await pipeline.acquire(d.project.id, ["two"]);
  lease.release();
  finish({ blob: new Blob(["frame"], { type: "image/webp" }), width: 768, height: 768 });
  await flushing;
  expect(d.render).toHaveBeenCalledTimes(2);
  expect(d.store.saveThumbnail).toHaveBeenCalledTimes(2);
  expect(d.store.load).not.toHaveBeenCalled();
  await pipeline.dispose();
});
it("never starts GPU work during pointer activity; explicit flush waits for quiet and cancellation removes queued idle callbacks", async () => {
  const d = fixture(),
    cancel = vi.fn();
  let idle: (() => void) | undefined;
  vi.stubGlobal(
    "requestIdleCallback",
    vi.fn((callback: () => void) => {
      idle = callback;
      return 7;
    }),
  );
  vi.stubGlobal("cancelIdleCallback", cancel);
  const pipeline = new ThumbnailPipeline(d.store, { ...d, delay: 10 });
  pipeline.schedule(d.project);
  await vi.advanceTimersByTimeAsync(10);
  expect(requestIdleCallback).toHaveBeenCalledOnce();
  d.activity.set(true);
  expect(cancel).toHaveBeenCalledWith(7);
  idle?.();
  expect(d.render).not.toHaveBeenCalled();
  const flushed = pipeline.flush();
  expect(d.render).not.toHaveBeenCalled();
  d.activity.set(false);
  await vi.advanceTimersByTimeAsync(0);
  idle?.();
  await flushed;
  expect(d.render).toHaveBeenCalledTimes(2);
  await pipeline.dispose();
});
it("discards obsolete results after a newer canonical project or deletion and never resurrects deleted previews", async () => {
  const d = fixture(createProject({ id: "project", pages: [createPage({ id: "page" })] })),
    pipeline = new ThumbnailPipeline(d.store, d);
  let finish!: (value: Awaited<ReturnType<typeof d.renderer.render>>) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  d.render.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  pipeline.schedule(d.project);
  const flush = pipeline.flush();
  await ready;
  pipeline.schedule({ ...d.project, pages: [{ ...d.project.pages[0]!, background: "#ff0000" }] });
  finish({ blob: new Blob(["old"], { type: "image/webp" }), width: 10, height: 10 });
  await flush;
  expect(d.store.saveThumbnail).toHaveBeenCalledTimes(1);
  pipeline.remove(d.project.id);
  pipeline.request(d.project.id);
  pipeline.remove(d.project.id);
  await pipeline.flush();
  expect(d.render).toHaveBeenCalledTimes(2);
  await pipeline.dispose();
});
it("uses lazy selected-page original loading only when a visible card lacks a saved thumbnail", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, d);
  d.records.push(
    record({ pageId: "page", revision: await thumbnailRevision(d.project.pages[0]!, {}) }),
  );
  const lease = await pipeline.acquire("project", ["page", "two"]);
  expect(lease.items).toHaveLength(1);
  expect(d.store.load).not.toHaveBeenCalled();
  await pipeline.flush();
  expect(d.store.load).toHaveBeenCalledWith("project", { observe: false });
  expect(d.render).toHaveBeenCalledOnce();
  lease.release();
  await pipeline.dispose();
});
it("requeues activity-aborted preparation, reports actual generation failures and tolerates stale storage guards", async () => {
  const d = fixture(createProject({ id: "project", pages: [createPage({ id: "page" })] })),
    onError = vi.fn(),
    pipeline = new ThumbnailPipeline(d.store, { ...d, onError });
  d.render
    .mockRejectedValueOnce(new DOMException("busy", "AbortError"))
    .mockRejectedValueOnce(new Error("GPU lost"));
  pipeline.schedule(d.project);
  await pipeline.flush();
  expect(onError).toHaveBeenCalledOnce();
  d.render.mockResolvedValueOnce({
    blob: new Blob(["ok"], { type: "image/webp" }),
    width: 10,
    height: 10,
  });
  vi.mocked(d.store.saveThumbnail).mockResolvedValueOnce(false);
  const listener = vi.fn();
  pipeline.subscribe(listener);
  pipeline.schedule(d.project);
  await pipeline.flush();
  expect(listener).not.toHaveBeenCalled();
  await pipeline.dispose();
});
it("bounds pending project references and cancels all queued work at disposal", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, d);
  d.activity.set(true);
  for (let index = 0; index < 12; index++) pipeline.schedule({ ...d.project, id: String(index) });
  const waiting = pipeline.flush();
  const disposal = pipeline.dispose();
  expect(pipeline.dispose()).toBe(disposal);
  await disposal;
  await waiting;
  pipeline.schedule(d.project);
  await pipeline.flush();
  expect(d.render).not.toHaveBeenCalled();
  await expect(pipeline.acquire("project")).rejects.toThrow("closed");
});
it("changes geometry from an actual engine transaction without starting a job for selection-only events", async () => {
  const layer = createLayer("rectangle"),
    project = createProject({ pages: [createPage({ layers: [layer] })] }),
    d = fixture(project),
    pipeline = new ThumbnailPipeline(d.store, d),
    engine = new EditorEngine(project);
  const stop = installThumbnailSchedule(engine, pipeline);
  await pipeline.flush();
  engine.select([layer.id]);
  await pipeline.flush();
  expect(d.render).toHaveBeenCalledOnce();
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { x: 25 } });
  await pipeline.flush();
  expect(d.render).toHaveBeenCalledTimes(2);
  stop();
  await pipeline.dispose();
});
it("resolves pending flush consumers if their only queued project is deleted during input", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, d);
  d.activity.set(true);
  pipeline.schedule(d.project);
  const waiting = pipeline.flush();
  pipeline.remove(d.project.id);
  await waiting;
  expect(d.render).not.toHaveBeenCalled();
  await pipeline.dispose();
});
it("rechecks activity after metadata preparation and resumes only requested pages after quiet", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, { ...d, delay: 10 });
  vi.mocked(d.store.thumbnailInfo).mockImplementationOnce(async () => {
    d.activity.set(true);
    return [];
  });
  pipeline.request(d.project.id, ["two"]);
  const waiting = pipeline.flush();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  expect(d.render).not.toHaveBeenCalled();
  d.activity.set(false);
  await vi.advanceTimersByTimeAsync(10);
  await waiting;
  expect(d.render).toHaveBeenCalledOnce();
  expect(d.render.mock.calls[0]![0].id).toBe("two");
  await pipeline.dispose();
});
it("discards a lazy project load that finishes after deletion and drains a regular timeout fallback", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, { ...d, delay: 10 });
  let finish!: (project: typeof d.project) => void;
  vi.mocked(d.store.load).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  pipeline.request(d.project.id);
  const waiting = pipeline.flush();
  for (let index = 0; index < 10; index++) await Promise.resolve();
  pipeline.remove(d.project.id);
  finish(d.project);
  await waiting;
  expect(d.render).not.toHaveBeenCalled();
  pipeline.schedule(d.project);
  await vi.advanceTimersByTimeAsync(10);
  await pipeline.flush();
  expect(d.render).toHaveBeenCalledTimes(2);
  await pipeline.dispose();
});
it("prioritizes explicit previews before queued canonical and background jobs on the same renderer", async () => {
  const d = fixture(),
    pipeline = new ThumbnailPipeline(d.store, { ...d, delay: 600 }),
    page = d.project.pages[0]!;
  pipeline.schedule(d.project);
  const background = pipeline.preview("layer", page, {}, { edge: 96 });
  const visible = pipeline.preview("visible-layer", page, {}, { edge: 96, priority: "visible" });
  const foreground = pipeline.preview("export", page, {}, { edge: 384, priority: "foreground" });
  await vi.advanceTimersByTimeAsync(0);
  await foreground;
  expect(d.render).toHaveBeenNthCalledWith(1, page, {}, expect.any(Function), 384);
  await vi.runAllTimersAsync();
  await visible;
  expect(d.render).toHaveBeenNthCalledWith(2, page, {}, expect.any(Function), 96);
  await pipeline.flush();
  await vi.runAllTimersAsync();
  await background;
  expect(d.render).toHaveBeenNthCalledWith(5, page, {}, expect.any(Function), 96);
  await pipeline.dispose();
});
it("does not force canonical GPU work through an exhausted idle deadline and still honors explicit flush", async () => {
  const d = fixture();
  let idle!: IdleRequestCallback;
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    idle = callback;
    return 8;
  });
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  const pipeline = new ThumbnailPipeline(d.store, { ...d, delay: 10 });
  pipeline.schedule(d.project);
  await vi.advanceTimersByTimeAsync(10);
  idle({ didTimeout: true, timeRemaining: () => 0 });
  expect(d.render).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(10);
  idle({ didTimeout: false, timeRemaining: () => 20 });
  await pipeline.flush();
  expect(d.render).toHaveBeenCalledTimes(2);
  await pipeline.dispose();
});
