import { beforeEach, expect, it, vi } from "vitest";
import { createPage, createProject, type Composition } from "@musart/core";
import { createMotionPreview } from "../../../src/export/motion/preview";
import { motionProject } from "./fixtures";

const state = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn(), options: vi.fn() }));
vi.mock("../../../src/export/standalone", () => ({
  createRenderSession: (options: unknown) => {
    state.options(options);
    return {
      withCanvasFrame: state.render,
      dispose: state.dispose,
      stats: () => ({ backend: "webgpu" }),
    };
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  state.dispose.mockResolvedValue(undefined);
  state.render.mockImplementation(
    async (_page: Composition, _assets: unknown, consume: (canvas: HTMLCanvasElement) => void) =>
      consume({} as HTMLCanvasElement),
  );
});
function clock() {
  let now = 0,
    next = 0;
  const callbacks = new Map<number, () => void>();
  return {
    callbacks,
    now: () => now,
    request: (callback: () => void) => {
      callbacks.set(++next, callback);
      return next;
    },
    cancel: (id: number) => {
      callbacks.delete(id);
    },
    async step(time: number) {
      now = time;
      const entry = callbacks.entries().next().value as [number, () => void] | undefined;
      if (entry) {
        callbacks.delete(entry[0]);
        entry[1]();
      }
      for (let i = 0; i < 8; i++) await Promise.resolve();
    },
  };
}
it("autoplays a frozen program with one acknowledged job and a bounded physical preview", async () => {
  const scheduler = clock(),
    project = structuredClone(motionProject()),
    onFrame = vi.fn();
  const preview = createMotionPreview(project, {
    compositionId: "composition",
    edge: 384,
    scheduler,
    onFrame,
  });
  expect(scheduler.callbacks.size).toBe(1);
  await scheduler.step(0);
  expect(onFrame).toHaveBeenCalledOnce();
  project.pages[0]!.layers[0]!.x = 999;
  await scheduler.step(100);
  expect(state.render.mock.calls[1]![0].layers[0].x).toBeCloseTo(2);
  expect(state.render.mock.calls[1]![3]).toMatchObject({ scale: 1, mediaMode: "exact" });
  expect(state.options).toHaveBeenCalledWith(
    expect.objectContaining({ maxBytes: 256 * 1024 * 1024 }),
  );
  await preview.dispose();
  expect(scheduler.callbacks.size).toBe(0);
  expect(state.dispose).toHaveBeenCalledOnce();
});
it("backpressure bounds work and seek/pause reject a superseded canvas before repainting the local pose", async () => {
  const scheduler = clock(),
    onFrame = vi.fn();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.render.mockImplementationOnce(
    async (_page: Composition, _assets: unknown, consume: (canvas: HTMLCanvasElement) => void) => {
      await gate;
      consume({} as HTMLCanvasElement);
    },
  );
  const preview = createMotionPreview(motionProject(), {
    compositionId: "composition",
    scheduler,
    onFrame,
  });
  await scheduler.step(0);
  await scheduler.step(100);
  expect(state.render).toHaveBeenCalledOnce();
  expect(scheduler.callbacks.size).toBe(0);
  preview.pause();
  preview.seek({ value: 1, rate: 2 });
  release();
  await scheduler.step(200);
  await scheduler.step(201);
  expect(onFrame).toHaveBeenCalledOnce();
  expect(preview.read()).toMatchObject({
    playing: false,
    time: { value: 1, rate: 2 },
    busy: false,
  });
  expect(state.render.mock.calls.at(-1)![0].layers[0].x).toBe(10);
  expect(scheduler.callbacks.size).toBe(0);
  preview.play();
  await scheduler.step(301);
  expect(preview.read().time.value / preview.read().time.rate).toBeCloseTo(0.6);
  await preview.dispose();
  await preview.dispose();
  expect(state.dispose).toHaveBeenCalledOnce();
});
it("rejects invalid/static requests without allocating GPU resources and cleans a failed render", async () => {
  expect(() =>
    createMotionPreview(createProject({ pages: [createPage({ id: "static" })] }), {
      compositionId: "static",
      onFrame: vi.fn(),
    }),
  ).toThrow(/Motion/);
  expect(() =>
    createMotionPreview(motionProject(), {
      compositionId: "composition",
      edge: 900,
      onFrame: vi.fn(),
    }),
  ).toThrow(/edge/);
  expect(state.options).not.toHaveBeenCalled();
  const error = new Error("GPU failed"),
    scheduler = clock();
  state.render.mockRejectedValueOnce(error);
  const preview = createMotionPreview(motionProject(), {
    compositionId: "composition",
    scheduler,
    onFrame: vi.fn(),
  });
  const listener = vi.fn(),
    stop = preview.subscribe(listener);
  await scheduler.step(0);
  expect(preview.read()).toMatchObject({ playing: false, busy: false, error });
  expect(scheduler.callbacks.size).toBe(0);
  expect(state.dispose).toHaveBeenCalledOnce();
  stop();
  await preview.dispose();
  const calls = listener.mock.calls.length;
  preview.play();
  preview.seek({ value: 0, rate: 1 });
  expect(listener).toHaveBeenCalledTimes(calls);
});
