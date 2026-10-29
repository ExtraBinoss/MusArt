import { expect, test, vi } from "vitest";
import { SRGBColorSpace } from "three";
import { VideoFrameTextureOwner } from "../../../src/sources/video/texture";
import { VideoFramePool } from "../../../src/sources/video/pool";
import { decoded, deferred, FakeFrame } from "./fixtures";

test("retains real Three texture identity and frame lease until its async consumer settles", async () => {
  const frames: FakeFrame[] = [],
    owner = new VideoFrameTextureOwner();
  const pool = new VideoFramePool(
    { assetId: "asset", contentRevision: "revision" },
    {
      maxCachedFrames: 0,
      maxDecodedBytes: 1024,
      maxFrameBytes: 64,
      maxSourceCacheBytes: 64,
      maxOpenBackends: 2,
      maxPendingExact: 2,
    },
  );
  const lease = pool.adopt(decoded(frames), { value: 0, rate: 1 }, false);
  const gate = deferred<void>();
  let texture;
  const consume = owner.withFrame(lease, async (value) => {
    texture = value;
    expect(value.colorSpace).toBe(SRGBColorSpace);
    await gate.promise;
  });
  expect(frames[0]!.closed).toBe(false);
  const close = owner.dispose(),
    closeAgain = owner.dispose();
  expect(closeAgain).toBe(close);
  gate.resolve();
  await consume;
  await close;
  expect(frames[0]!.closes).toBe(1);
  expect(texture).toBeDefined();
  await pool.close();
});

test("reuses textures of equal dimensions and releases rejected or failed consumers", async () => {
  const frames: FakeFrame[] = [],
    owner = new VideoFrameTextureOwner();
  const pool = new VideoFramePool(
    { assetId: "asset", contentRevision: "revision" },
    {
      maxCachedFrames: 0,
      maxDecodedBytes: 1024,
      maxFrameBytes: 64,
      maxSourceCacheBytes: 64,
      maxOpenBackends: 2,
      maxPendingExact: 2,
    },
  );
  const first = await owner.withFrame(
    pool.adopt(decoded(frames), { value: 0, rate: 1 }, false),
    (texture) => texture,
  );
  const second = await owner.withFrame(
    pool.adopt(decoded(frames), { value: 0, rate: 1 }, false),
    (texture) => texture,
  );
  expect(second).toBe(first);
  const disposed = vi.fn();
  first.addEventListener("dispose", disposed);
  await expect(
    owner.withFrame(pool.adopt(decoded(frames), { value: 0, rate: 1 }, false), () => {
      throw new Error("GPU consumer failed");
    }),
  ).rejects.toThrow("GPU consumer failed");
  await owner.dispose();
  expect(disposed).toHaveBeenCalledOnce();
  await expect(
    owner.withFrame(pool.adopt(decoded(frames), { value: 0, rate: 1 }, false), () => {}),
  ).rejects.toMatchObject({ code: "closed" });
  expect(frames.every((frame) => frame.closes === 1)).toBe(true);
  await pool.close();
});

test("reallocates the GPU texture when presentation dimensions change with equal coded dimensions", async () => {
  const owner = new VideoFrameTextureOwner();
  const frames: FakeFrame[] = [];
  const firstDecoded = decoded(frames);
  const secondDecoded = decoded(frames);
  frames[1]!.displayWidth = 4;
  const first = await owner.withFrame(
    {
      ...firstDecoded,
      assetId: "asset",
      contentRevision: "revision",
      requestedTime: { value: 0, rate: 1 },
      release: () => firstDecoded.frame.close(),
    },
    (value) => value,
  );
  const disposed = vi.fn();
  first.addEventListener("dispose", disposed);
  const second = await owner.withFrame(
    {
      ...secondDecoded,
      assetId: "asset",
      contentRevision: "revision",
      requestedTime: { value: 0, rate: 1 },
      release: () => secondDecoded.frame.close(),
    },
    (value) => value,
  );
  expect(second).not.toBe(first);
  expect(disposed).toHaveBeenCalledOnce();
  await owner.dispose();
  expect(frames.every((frame) => frame.closes === 1)).toBe(true);
});
