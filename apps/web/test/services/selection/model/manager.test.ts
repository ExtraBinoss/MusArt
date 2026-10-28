import { expect, test, vi } from "vitest";
import { LocalModelManager } from "../../../../src/services/selection/model/manager";
import { MODEL_BYTES, MODEL_FILES } from "../../../../src/services/selection/model/manifest";
const info = { available: true, bytes: MODEL_BYTES, files: 4, supported: true };
function deferred() {
  let resolve!: () => void, reject!: (reason: Error) => void;
  const promise = new Promise<void>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
test("tracks actual pinned-file bytes, initialization and real completion with bounded immutable snapshots", async () => {
  const pending = deferred(),
    prepare = vi.fn(() => pending.promise),
    inspect = vi.fn(async () => info),
    changed = vi.fn();
  const manager = new LocalModelManager({ prepare, inspect, cancel: vi.fn() }),
    stop = manager.subscribe(changed);
  expect(manager.read().total).toBe(MODEL_BYTES);
  expect(Object.isFrozen(manager.read())).toBe(true);
  const run = manager.prepare();
  expect(prepare).toHaveBeenCalledOnce();
  await expect(manager.prepare()).rejects.toThrow("busy");
  manager.note({ file: "vision_encoder.onnx", status: "progress", loaded: 100 });
  expect(manager.read()).toMatchObject({ loaded: 100, phase: "loading" });
  const before = manager.read();
  manager.note({ file: "unknown", status: "done" });
  manager.note({ file: "config.json", status: "progress", loaded: NaN });
  manager.note({ file: "config.json", status: "progress", loaded: -1 });
  expect(manager.read()).toBe(before);
  for (const file of Object.keys(MODEL_FILES)) manager.note({ file, status: "done" });
  expect(manager.read()).toMatchObject({ loaded: MODEL_BYTES, phase: "initializing" });
  pending.resolve();
  await run;
  expect(manager.read()).toMatchObject({ ...info, phase: "ready", loaded: MODEL_BYTES });
  const calls = changed.mock.calls.length;
  manager.ready();
  expect(changed).toHaveBeenCalledTimes(calls);
  stop();
  manager.dispose();
});
test("rejects real failures, allows retry, and cancellation cannot let an old result overwrite a newer attempt", async () => {
  const first = deferred(),
    second = deferred(),
    prepare = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    cancel = vi.fn();
  const manager = new LocalModelManager({ prepare, cancel, inspect: async () => info });
  const old = manager.prepare();
  manager.failed(Error("offline"));
  expect(manager.read().error).toBe("offline");
  manager.cancel();
  expect(cancel).toHaveBeenCalledOnce();
  expect(manager.read().phase).toBe("idle");
  const next = manager.prepare();
  first.resolve();
  await expect(old).rejects.toMatchObject({ name: "AbortError" });
  expect(manager.read().phase).toBe("loading");
  second.resolve();
  await next;
  expect(manager.read().phase).toBe("ready");
  manager.failed("image decoding failure");
  expect(manager.read().phase).toBe("ready");
  const failing = new LocalModelManager({
    prepare: async () => {
      throw Error("download failed");
    },
    cancel,
  });
  await expect(failing.prepare()).rejects.toThrow("download failed");
  expect(failing.read()).toMatchObject({ phase: "error", error: "download failed" });
  manager.dispose();
  failing.dispose();
});
test("removes only after active preparation ends, prevents stale refresh adoption and reports deletion failures", async () => {
  const pending = deferred(),
    cache = deferred(),
    remove = vi.fn(async () => ({ ...info, available: false, bytes: 0, files: 0 })),
    cancel = vi.fn();
  let refreshed = false;
  const manager = new LocalModelManager({
    prepare: () => pending.promise,
    cancel,
    inspect: async () => {
      if (!refreshed) {
        refreshed = true;
        await cache.promise;
      }
      return info;
    },
    remove,
  });
  const stale = manager.refresh();
  const run = manager.prepare();
  await expect(manager.remove()).rejects.toThrow("Cancel");
  manager.cancel();
  pending.resolve();
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
  await manager.remove();
  cache.resolve();
  await stale;
  expect(manager.read()).toMatchObject({ phase: "idle", files: 0, bytes: 0, available: false });
  remove.mockRejectedValueOnce(Error("quota"));
  await expect(manager.remove()).rejects.toThrow("quota");
  expect(manager.read()).toMatchObject({ phase: "error", error: "quota" });
  manager.dispose();
});
