import { expect, test, vi } from "vitest";
import { createBloomTemplate } from "../../../../../src/services/projects/templates/motion/showcase";
import { templateMedia } from "../../../../support/motion-template-media";
import {
  startMotionTemplatePreview,
  type PreviewDependencies,
} from "../../../../../src/components/projects/templates/motion-preview/runtime";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  for (let i = 0; i < 14; i++) await Promise.resolve();
}
function fixture() {
  const media = templateMedia(),
    { project } = createBloomTemplate(media);
  const callbacks = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const times: number[] = [];
  const host = document.createElement("span"),
    canvas = document.createElement("canvas");
  let gate: ReturnType<typeof deferred> | null = null;
  const dispose = vi.fn(async (): Promise<void> => undefined);
  const session: Awaited<ReturnType<PreviewDependencies["createSession"]>> = {
    withCanvasFrame: async (_page, _assets, consume, options) => {
      times.push(
        options?.motionFrame ? options.motionFrame.time.value / options.motionFrame.time.rate : -1,
      );
      const current = gate;
      gate = null;
      if (current) await current.promise;
      return consume(canvas);
    },
    dispose,
  };
  const dependencies: PreviewDependencies = {
    prepare: vi.fn(async () => ({
      project,
      originals: [
        {
          originalId: media.video.originalId,
          contentRevision: media.video.contentRevision,
          blob: new Blob(["video"], { type: "video/mp4" }),
        },
      ],
    })),
    createSession: vi.fn(async () => session),
    now: () => 1000,
    requestFrame: (callback) => {
      const id = ++sequence;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      callbacks.delete(id);
    },
  };
  const status = vi.fn();
  return {
    host,
    canvas,
    times,
    callbacks,
    dependencies,
    dispose,
    session,
    project,
    status,
    hold: () => (gate = deferred()),
    tick: (time: number) => {
      const [id, callback] = [...callbacks.entries()][0]!;
      callbacks.delete(id);
      callback(time);
    },
    start: () =>
      startMotionTemplatePreview({ templateId: "in-bloom", host, onStatus: status }, dependencies),
  };
}

test("presents the actual retained GPU canvas, pauses the clock until ready and resolves exact originals", async () => {
  const f = fixture(),
    gate = f.hold(),
    owner = f.start();
  await flush();
  expect(f.callbacks.size).toBe(0);
  expect(f.status).toHaveBeenLastCalledWith("loading");
  expect(f.host.children).toHaveLength(0);
  gate.resolve();
  await flush();
  expect(f.host.firstChild).toBe(f.canvas);
  expect(f.status).toHaveBeenLastCalledWith("playing");
  expect(f.times).toEqual([0]);
  const options = vi.mocked(f.dependencies.createSession).mock.calls[0]![0];
  expect(options.maxBytes).toBe(128 * 1024 * 1024);
  const video = Object.values(f.project.assets).find((asset) => asset.kind === "video")!;
  await expect(
    options.mediaResolver!.resolveOriginal(
      video as Parameters<NonNullable<typeof options.mediaResolver>["resolveOriginal"]>[0],
    ),
  ).resolves.toBeInstanceOf(Blob);
  f.tick(1333);
  await flush();
  expect(f.times.at(-1)).toBe(0.3);
  await owner.release();
  expect(f.host.children).toHaveLength(0);
  expect(f.callbacks.size).toBe(0);
  expect(f.dispose).toHaveBeenCalledOnce();
});

test("coalesces queued samples to the latest time and loops the genuine five-second composition", async () => {
  const f = fixture(),
    owner = f.start();
  await flush();
  const gate = f.hold();
  f.tick(1100);
  await flush();
  f.tick(1200);
  f.tick(1300);
  await flush();
  expect(f.times).toEqual([0, 0.1]);
  gate.resolve();
  await flush();
  expect(f.times).toEqual([0, 0.1, 0.3]);
  f.tick(6100);
  await flush();
  expect(f.times.at(-1)).toBe(0.1);
  await owner.release();
});

test("a second card waits for the previous GPU owner to finish disposal", async () => {
  const first = fixture(),
    second = fixture(),
    barrier = deferred();
  const a = first.start();
  await flush();
  first.dispose.mockImplementation(async () => barrier.promise);
  const b = second.start();
  await flush();
  expect(first.host.children).toHaveLength(0);
  expect(first.callbacks.size).toBe(0);
  expect(second.dependencies.prepare).not.toHaveBeenCalled();
  barrier.resolve();
  await flush();
  expect(second.status).toHaveBeenLastCalledWith("playing");
  await b.release();
  await a.release();
});

test("leaving during asynchronous preparation prevents GPU creation and late canvas publication", async () => {
  const f = fixture(),
    barrier = deferred();
  const original = f.dependencies.prepare;
  f.dependencies.prepare = vi.fn(async (id, signal) => {
    await barrier.promise;
    return original(id, signal);
  });
  const owner = f.start();
  await flush();
  const release = owner.release();
  barrier.resolve();
  await release;
  expect(f.dependencies.createSession).not.toHaveBeenCalled();
  expect(f.host.children).toHaveLength(0);
  expect(f.status).toHaveBeenLastCalledWith("idle");
});

test("real preparation or render failures retain a visible failure state and release resources", async () => {
  const f = fixture();
  f.dependencies.prepare = vi.fn(async () => {
    throw new Error("Download failed");
  });
  const first = f.start();
  await flush();
  expect(f.status).toHaveBeenCalledWith(
    "failed",
    expect.objectContaining({ message: "Download failed" }),
  );
  await first.release();
  const second = fixture();
  second.session.withCanvasFrame = vi.fn(async () => {
    throw new Error("GPU lost");
  });
  const next = second.start();
  await flush();
  expect(second.status).toHaveBeenLastCalledWith(
    "failed",
    expect.objectContaining({ message: "GPU lost" }),
  );
  expect(second.dispose).toHaveBeenCalledOnce();
  expect(second.host.children).toHaveLength(0);
  await next.release();
});

test("leaving a card retains the disposal fence before another card may create its GPU session", async () => {
  const first = fixture(),
    second = fixture(),
    barrier = deferred();
  const owner = first.start();
  await flush();
  first.dispose.mockImplementation(async () => barrier.promise);
  const closing = owner.release();
  const next = second.start();
  await flush();
  expect(second.dependencies.createSession).not.toHaveBeenCalled();
  barrier.resolve();
  await closing;
  await flush();
  expect(second.status).toHaveBeenLastCalledWith("playing");
  await next.release();
});
