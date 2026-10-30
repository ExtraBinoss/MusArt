import { beforeEach, expect, it, vi } from "vitest";
import { RenderTarget } from "three/webgpu";
import { VideoRasterizer } from "../../../src/sources/video/rasterizer";
import { settleVideoUpload } from "../../../src/sources/video/settle";
import type { VideoFrameLease } from "../../../src/sources/video/model";
import { makeGpuRenderer } from "../../gpu-fixture";
import { deferred } from "./fixtures";
vi.mock("../../../src/sources/video/settle", () => ({ settleVideoUpload: vi.fn(async () => {}) }));
function lease() {
  return {
    frame: { codedWidth: 2, codedHeight: 2, displayWidth: 4, displayHeight: 2 },
    rotation: 0,
    flip: false,
    release: vi.fn(),
  } as unknown as VideoFrameLease;
}
beforeEach(() => vi.mocked(settleVideoUpload).mockReset().mockResolvedValue(undefined));
it("submits without blocking on the fence, keeps native frames alive and restores renderer state", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    budget = vi.fn(),
    rasterizer = new VideoRasterizer(renderer, { reserveBytes: budget }),
    target = new RenderTarget(2, 2);
  const gate = deferred<void>();
  vi.mocked(settleVideoUpload).mockReturnValueOnce(gate.promise);
  const frame = lease();
  await rasterizer.render(frame, target);
  expect(frame.release).not.toHaveBeenCalled();
  expect(fake.getRenderTarget()).toBeNull();
  expect(rasterizer.stats()).toMatchObject({
    slots: 1,
    pending: 1,
    textureBytes: 32,
    profile: null,
  });
  expect(budget).toHaveBeenLastCalledWith(32);
  let disposed = false;
  const closing = rasterizer.dispose().then(() => {
    disposed = true;
  });
  await Promise.resolve();
  expect(disposed).toBe(false);
  gate.resolve();
  await closing;
  expect(frame.release).toHaveBeenCalledTimes(1);
  expect(budget).toHaveBeenLastCalledWith(0);
  const rejected = lease();
  await expect(rasterizer.render(rejected, target)).rejects.toThrow("closed");
  expect(rejected.release).toHaveBeenCalledTimes(1);
  target.dispose();
});
it("bounds each stream to three native uploads and applies backpressure until an acknowledgement", async () => {
  const { renderer } = makeGpuRenderer(),
    rasterizer = new VideoRasterizer(renderer),
    target = new RenderTarget(2, 2),
    gates = Array.from({ length: 4 }, () => deferred<void>()),
    frames = Array.from({ length: 4 }, lease);
  for (const gate of gates) vi.mocked(settleVideoUpload).mockReturnValueOnce(gate.promise);
  for (let index = 0; index < 3; index++) await rasterizer.render(frames[index]!, target);
  let fourth = false;
  const pending = rasterizer.render(frames[3]!, target).then(() => {
    fourth = true;
  });
  await Promise.resolve();
  expect(fourth).toBe(false);
  expect(rasterizer.stats()).toMatchObject({ slots: 3, pending: 3, peakPending: 3 });
  gates[0]!.resolve();
  await pending;
  expect(rasterizer.stats().slots).toBe(3);
  expect(frames[0]!.release).toHaveBeenCalledTimes(1);
  for (const gate of gates) gate.resolve();
  await rasterizer.settle();
  await rasterizer.dispose();
  expect(frames.every((frame) => vi.mocked(frame.release).mock.calls.length === 1)).toBe(true);
  target.dispose();
});
it("retains failure ownership through the fence and reports asynchronous GPU errors", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    rasterizer = new VideoRasterizer(renderer),
    target = new RenderTarget(2, 2);
  const gate = deferred<void>(),
    frame = lease();
  vi.mocked(settleVideoUpload).mockReturnValueOnce(gate.promise);
  fake.render.mockImplementationOnce(() => {
    throw Error("submission failed");
  });
  const failure = rasterizer.render(frame, target);
  void failure.catch(() => {});
  await Promise.resolve();
  expect(frame.release).not.toHaveBeenCalled();
  gate.resolve();
  await expect(failure).rejects.toThrow("submission failed");
  expect(frame.release).toHaveBeenCalledTimes(1);
  await expect(rasterizer.dispose()).rejects.toThrow("disposal failed");
  target.dispose();
  const next = new VideoRasterizer(renderer),
    lost = lease();
  vi.mocked(settleVideoUpload).mockRejectedValueOnce(Error("device lost"));
  await next.render(lost, new RenderTarget(2, 2));
  await expect(next.settle()).rejects.toThrow("acknowledgement failed");
  await expect(next.dispose()).rejects.toThrow("disposal failed");
  expect(lost.release).toHaveBeenCalledTimes(1);
});
it("rejects budget admission before creating a GPU texture and records bounded opt-in samples", async () => {
  const { renderer } = makeGpuRenderer(),
    reject = new VideoRasterizer(renderer, {
      reserveBytes: () => {
        throw Error("GPU budget");
      },
    }),
    target = new RenderTarget(2, 2),
    frame = lease();
  await expect(reject.render(frame, target)).rejects.toThrow("GPU budget");
  expect(frame.release).toHaveBeenCalledTimes(1);
  await reject.dispose();
  const rasterizer = new VideoRasterizer(renderer);
  for (let index = 0; index < 260; index++) await rasterizer.render(lease(), target, "clip", true);
  await rasterizer.settle();
  expect(rasterizer.stats().profile!.submit).toHaveLength(256);
  expect(rasterizer.stats().profile!.acknowledgement).toHaveLength(256);
  await rasterizer.retainStreams(new Set());
  expect(rasterizer.stats().textureBytes).toBe(0);
  await rasterizer.dispose();
  target.dispose();
});

it("rejects actual presentation dimensions beyond the device limit before any GPU admission", async () => {
  const { renderer, fake } = makeGpuRenderer();
  fake.backend.device.limits.maxTextureDimension2D = 3;
  const budget = vi.fn(),
    rasterizer = new VideoRasterizer(renderer, { reserveBytes: budget }),
    target = new RenderTarget(1, 1),
    frame = lease();
  await expect(rasterizer.render(frame, target)).rejects.toThrow("device limit of 3px");
  expect(frame.release).toHaveBeenCalledTimes(1);
  expect(fake.render).not.toHaveBeenCalled();
  expect(budget).not.toHaveBeenCalled();
  expect(rasterizer.stats().textureBytes).toBe(0);
  await rasterizer.dispose();
  target.dispose();
});
it("fences the previous composition before retiring old-size proxy upload textures", async () => {
  const { renderer } = makeGpuRenderer(),
    reserveBytes = vi.fn();
  const rasterizer = new VideoRasterizer(renderer, { reserveBytes }),
    target = new RenderTarget(2, 2);
  await rasterizer.render(lease(), target, "clip");
  await rasterizer.settle();
  const fence = deferred<void>();
  vi.mocked(settleVideoUpload).mockReturnValueOnce(fence.promise);
  let retired = false;
  const retirement = rasterizer.retireStream("clip").then(() => {
    retired = true;
  });
  await Promise.resolve();
  expect(retired).toBe(false);
  expect(rasterizer.stats().textureBytes).toBe(32);
  fence.resolve();
  await retirement;
  expect(rasterizer.stats()).toMatchObject({ streams: 0, slots: 0, textureBytes: 0, pending: 0 });
  expect(reserveBytes).toHaveBeenLastCalledWith(0);
  await rasterizer.dispose();
  target.dispose();
});
