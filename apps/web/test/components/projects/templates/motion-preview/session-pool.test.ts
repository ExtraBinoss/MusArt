import { afterEach, expect, test, vi } from "vitest";
import {
  PreviewSessionPool,
  type PreviewSession,
} from "../../../../../src/components/projects/templates/motion-preview/session-pool";
import { createPage } from "@musart/core";

function fixture() {
  const dispose = vi.fn(async () => {});
  const render = vi.fn(async (_page: unknown, _assets: unknown, _options: unknown) =>
    document.createElement("canvas"),
  );
  const session: PreviewSession = {
    withCanvasFrame: async (page, assets, consume, options) =>
      consume(await render(page, assets, options)),
    dispose,
  };
  const create = vi.fn(async () => session),
    cleared = vi.fn();
  const pool = new PreviewSessionPool(create, cleared, 100);
  return { pool, create, cleared, dispose, render };
}
afterEach(() => vi.useRealTimers());
test("reuses one renderer but never retains the previous hover signal or media resolver", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    abort = new AbortController();
  const first = await f.pool.acquire({ maxBytes: 1000, signal: abort.signal });
  abort.abort();
  await first.dispose();
  const second = await f.pool.acquire({ maxBytes: 1000 });
  expect(f.create).toHaveBeenCalledExactlyOnceWith({
    maxBytes: 1000,
    fontResolver: undefined,
    forceWebGL: undefined,
  });
  expect(f.dispose).not.toHaveBeenCalled();
  await expect(first.withCanvasFrame(createPage(), {}, () => {})).rejects.toThrow("closed");
  await second.withCanvasFrame(createPage(), {}, () => {});
  await second.dispose();
  await first.dispose();
  await vi.advanceTimersByTimeAsync(100);
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(f.cleared).toHaveBeenCalledOnce();
});
test("keeps exclusive ownership, cancels idle expiry and retires incompatible font contexts", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    first = await f.pool.acquire({ maxBytes: 1000 });
  await expect(f.pool.acquire({ maxBytes: 1000 })).rejects.toThrow("owner");
  await first.dispose();
  await vi.advanceTimersByTimeAsync(50);
  const second = await f.pool.acquire({ maxBytes: 1000 });
  await vi.advanceTimersByTimeAsync(100);
  expect(f.dispose).not.toHaveBeenCalled();
  await second.dispose();
  const third = await f.pool.acquire({
    maxBytes: 1000,
    fontResolver: async () => new ArrayBuffer(0),
  });
  expect(f.create).toHaveBeenCalledTimes(2);
  expect(f.dispose).toHaveBeenCalledOnce();
  await third.dispose();
  await f.pool.clear();
  expect(f.dispose).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
test("does not cache creation failures and retires poisoned sessions after a failed frame", async () => {
  const f = fixture();
  f.create.mockRejectedValueOnce(Error("Initialization failed"));
  await expect(f.pool.acquire({ maxBytes: 1000 })).rejects.toThrow("Initialization failed");
  const lease = await f.pool.acquire({ maxBytes: 1000 });
  f.render.mockRejectedValueOnce(Error("Device lost"));
  await expect(lease.withCanvasFrame(createPage(), {}, () => {})).rejects.toThrow("Device lost");
  await lease.dispose();
  expect(f.dispose).toHaveBeenCalledOnce();
  await f.pool.clear();
  expect(f.dispose).toHaveBeenCalledOnce();
});

test("ordinary cancellation keeps warm resources for the next owner", async () => {
  const f = fixture(),
    first = await f.pool.acquire({ maxBytes: 1000 });
  f.render.mockRejectedValueOnce(new DOMException("Stale frame", "AbortError"));
  await expect(first.withCanvasFrame(createPage(), {}, () => {})).rejects.toMatchObject({
    name: "AbortError",
  });
  await first.dispose();
  const second = await f.pool.acquire({ maxBytes: 1000 });
  expect(f.create).toHaveBeenCalledOnce();
  await second.dispose();
  await f.pool.clear();
});
