import { expect, it, vi } from "vitest";
import { createProject, EditorEngine, type Composition } from "@musart/core";
import type { createRenderSession } from "@musart/render";
import { createTransitionPreviewSession } from "../../../../src/components/motion/transitions/preview-session";

function fixture() {
  let time = 0,
    sequence = 0;
  const frames = new Map<number, () => void>();
  const scheduler = {
    now: () => time,
    request: (callback: () => void) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancel: (id: number) => {
      frames.delete(id);
    },
  };
  const canvas = document.createElement("canvas");
  const render = vi.fn(
    async (_page: Composition, _assets: unknown, consume: (canvas: HTMLCanvasElement) => void) => {
      consume(canvas);
    },
  );
  const dispose = vi.fn(async () => {});
  const create = vi.fn(
    () =>
      ({
        withCanvasFrame: render,
        dispose,
        stats: () => ({ backend: "webgpu" }),
      }) as unknown as ReturnType<typeof createRenderSession>,
  );
  const load = vi.fn(async () => ({ createRenderSession: create as typeof createRenderSession }));
  const engine = new EditorEngine(createProject());
  const onFrame = vi.fn(),
    onError = vi.fn();
  const source = createTransitionPreviewSession(engine, { scheduler, load, onFrame, onError });
  const flush = async () => {
    for (let index = 0; index < 15; index++) await Promise.resolve();
  };
  const step = async (now: number) => {
    time = now;
    const next = frames.entries().next().value;
    if (next) {
      frames.delete(next[0]);
      next[1]();
    }
    await flush();
  };
  return {
    source,
    scheduler,
    load,
    create,
    render,
    dispose,
    frames,
    step,
    flush,
    engine,
    onFrame,
    onError,
  };
}
const fade = { style: "fade", placement: "in", duration: 500 } as const;

it("retains one bounded renderer across choices and leaves the user's engine untouched", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot();
  expect(d.create).not.toHaveBeenCalled();
  d.source.update(fade);
  await d.step(0);
  expect(d.create).toHaveBeenCalledOnce();
  expect(d.create).toHaveBeenCalledWith({ maxBytes: 32 * 1024 * 1024 });
  expect(d.onFrame.mock.calls[0]![0].dataset.transitionStyle).toBe("fade");
  expect(d.frames.size).toBe(0);
  d.source.update({ ...fade, style: "wipe" });
  await d.step(100);
  expect(d.create).toHaveBeenCalledOnce();
  expect(d.render.mock.calls[1]![0].layers[0]!.effects[0]!.settings).toMatchObject({
    style: "wipe",
  });
  expect(d.engine.getSnapshot()).toBe(before);
  await d.source.dispose();
  await d.source.dispose();
  expect(d.dispose).toHaveBeenCalledOnce();
});
it("bounds in-flight work, rejects stale choices and awaits GPU completion before disposal", async () => {
  const d = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  d.render.mockImplementationOnce(async (_page, _assets, consume) => {
    await gate;
    consume(document.createElement("canvas"));
  });
  d.source.update(fade);
  d.source.play(true);
  await d.step(0);
  expect(d.frames.size).toBe(0);
  d.source.update({ ...fade, style: "iris" });
  await d.step(100);
  expect(d.render).toHaveBeenCalledOnce();
  release();
  await d.flush();
  expect(d.onFrame).not.toHaveBeenCalled();
  await d.step(200);
  expect(d.onFrame.mock.calls[0]![0].dataset.transitionStyle).toBe("iris");
  let finish!: () => void;
  d.render.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  await d.step(300);
  const closing = d.source.dispose();
  expect(d.dispose).not.toHaveBeenCalled();
  finish();
  await closing;
  expect(d.dispose).toHaveBeenCalledOnce();
  expect(d.frames.size).toBe(0);
});
it("pauses outside hover/visibility and serializes engine leases without parallel renderers", async () => {
  const d = fixture();
  d.source.update(fade);
  d.source.play(true);
  await d.step(0);
  d.source.play(false);
  expect(d.frames.size).toBe(0);
  d.source.visible(false);
  d.source.play(true);
  expect(d.frames.size).toBe(0);
  d.source.visible(true);
  await d.step(100);
  expect(d.render).toHaveBeenCalledTimes(2);
  let released!: () => void;
  d.dispose.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        released = resolve;
      }),
  );
  const next = createTransitionPreviewSession(d.engine, {
    scheduler: d.scheduler,
    load: d.load,
    onFrame: d.onFrame,
    onError: d.onError,
  });
  next.update(fade);
  await d.step(200);
  expect(d.create).toHaveBeenCalledOnce();
  released();
  await d.flush();
  expect(d.create).toHaveBeenCalledTimes(2);
  await next.dispose();
});
it("reports render failures, disposes GPU resources and stops scheduling", async () => {
  const d = fixture();
  d.render.mockRejectedValueOnce(Error("GPU failed"));
  d.source.update(fade);
  d.source.play(true);
  await d.step(0);
  expect(d.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "GPU failed" }));
  expect(d.dispose).toHaveBeenCalledOnce();
  expect(d.frames.size).toBe(0);
  await d.source.dispose();
});

it("publishes the first acknowledged frame when cold hover ends before the GPU job", async () => {
  const d = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  d.render.mockImplementationOnce(async (_page, _assets, consume) => {
    await gate;
    consume(document.createElement("canvas"));
  });
  d.source.update(fade);
  d.source.play(true);
  await d.step(0);
  d.source.play(false);
  release();
  await d.flush();
  expect(d.onFrame).toHaveBeenCalledOnce();
  expect(d.frames.size).toBe(0);
  await d.source.dispose();
});
