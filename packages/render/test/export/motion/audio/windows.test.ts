import { expect, it, vi } from "vitest";
import { createMotionAudioWindows } from "../../../../src/export/motion/audio/windows";

function source(frames = 4800) {
  return {
    sampleRate: 48000,
    channels: 1 as const,
    dispose: vi.fn(),
    readWindow: vi.fn(async (start: number) => [
      {
        timestamp: start,
        sampleRate: 48000,
        frames,
        channels: [new Float32Array(frames).fill(0.25)],
      },
    ]),
  };
}

it("reuses a genuine bounded decoded window for adjacent and reverse blocks and retires it explicitly", async () => {
  const d = source(),
    cache = createMotionAudioWindows(0.08);
  const first = await cache.read(d, 0, 0.02, {});
  expect(d.readWindow).toHaveBeenLastCalledWith(0, 0.08, {});
  expect(await cache.read(d, 0.02, 0.04, {})).toBe(first);
  expect(await cache.read(d, 0.01, 0.03, {})).toBe(first);
  await cache.read(d, 0.07, 0.09, {});
  expect(d.readWindow).toHaveBeenCalledTimes(2);
  cache.forget(d);
  await cache.read(d, 0.07, 0.09, {});
  expect(d.readWindow).toHaveBeenCalledTimes(3);
  cache.dispose();
  await expect(cache.read(d, 0.07, 0.09, {})).rejects.toMatchObject({ code: "closed" });
});

it("bounds retained PCM by bytes and four sources, without truncating oversized real responses", async () => {
  const cache = createMotionAudioWindows(0.08),
    large = Array.from({ length: 3 }, () => source(200000));
  for (const d of large) await cache.read(d, 0, 0.01, {});
  await cache.read(large[0]!, 0, 0.01, {});
  expect(large[0]!.readWindow).toHaveBeenCalledTimes(2);
  const oversize = source(600000);
  expect((await cache.read(oversize, 0, 0.01, {}))[0]!.frames).toBe(600000);
  await cache.read(oversize, 0, 0.01, {});
  expect(oversize.readWindow).toHaveBeenCalledTimes(2);
  cache.dispose();
  const small = createMotionAudioWindows(0.08),
    readers = Array.from({ length: 5 }, () => source(4));
  for (const d of readers) await small.read(d, 0, 0.01, {});
  await small.read(readers[0]!, 0, 0.01, {});
  expect(readers[0]!.readWindow).toHaveBeenCalledTimes(2);
  small.dispose();
});

it("rejects canceled and retired asynchronous fills and never resurrects their cached PCM", async () => {
  for (const retire of ["abort", "dispose"] as const) {
    const cache = createMotionAudioWindows(0.08),
      controller = new AbortController();
    let finish!: () => void;
    const d = source();
    d.readWindow.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return [];
    });
    const read = cache.read(d, 0, 0.01, { signal: controller.signal });
    if (retire === "abort") controller.abort();
    else cache.dispose();
    finish();
    await expect(read).rejects.toMatchObject(
      retire === "abort" ? { name: "AbortError" } : { code: "closed" },
    );
    cache.dispose();
  }
  for (const value of [-1, NaN, 1]) expect(() => createMotionAudioWindows(value)).toThrow();
  const direct = createMotionAudioWindows(0),
    d = source();
  await direct.read(d, 0, 0.01, {});
  await direct.read(d, 0, 0.01, {});
  expect(d.readWindow).toHaveBeenCalledTimes(2);
  direct.dispose();
});
