import { afterEach, expect, test, vi } from "vitest";
import { createProject, stateFromProject } from "@musart/core";
import {
  CanonicalHasher,
  type HashWorkerPort,
} from "../../../../src/services/serialization/hashing/client";
import type {
  CanonicalHashJob,
  HashRequest,
} from "../../../../src/services/serialization/hashing/protocol";

const value = "a".repeat(64);
const makeJob = (): CanonicalHashJob => ({
  kind: "history",
  state: stateFromProject(createProject()),
});
class WorkerFixture implements HashWorkerPort {
  messages: HashRequest[] = [];
  postMessage = vi.fn((message: HashRequest) => {
    this.messages.push(structuredClone(message));
  });
  terminate = vi.fn();
  onmessage: HashWorkerPort["onmessage"] = null;
  onerror: HashWorkerPort["onerror"] = null;
  onmessageerror: HashWorkerPort["onmessageerror"] = null;
  reply(id: number, result: Record<string, unknown> = { value }) {
    this.onmessage?.(new MessageEvent("message", { data: { id, ...result } }));
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("clones call-time inputs, routes out-of-order responses, and owns a lazy reusable module worker", async () => {
  const worker = new WorkerFixture(),
    createWorker = vi.fn(() => worker);
  const hasher = new CanonicalHasher({ createWorker });
  expect(createWorker).not.toHaveBeenCalled();
  const job = makeJob(),
    originalName = job.kind === "history" ? job.state.name : "",
    first = hasher.hash(job),
    second = hasher.hash(makeJob());
  if (job.kind === "history") job.state.name = "Later";
  expect(worker.messages[0]).toMatchObject({
    type: "hash",
    job: { state: { name: originalName } },
  });
  worker.reply(99);
  worker.reply(2, { value: "b".repeat(64) });
  worker.reply(1);
  expect(await first).toBe(value);
  expect(await second).toBe("b".repeat(64));
  expect(createWorker).toHaveBeenCalledOnce();
  hasher.dispose();
  hasher.dispose();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(worker.onmessage).toBeNull();
  expect(worker.onerror).toBeNull();
  expect(worker.onmessageerror).toBeNull();
  await expect(hasher.hash(makeJob())).rejects.toThrow("disposed");
});

test("bounds physical snapshots even after cancellation and accepts more only after acknowledgment", async () => {
  const worker = new WorkerFixture(),
    hasher = new CanonicalHasher({ createWorker: () => worker, maxPending: 1 });
  const abort = new AbortController(),
    pending = hasher.hash(makeJob(), { signal: abort.signal });
  abort.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(worker.messages[1]).toEqual({ type: "cancel", id: 1 });
  await expect(hasher.hash(makeJob())).rejects.toThrow("full");
  worker.reply(1, { error: "cancelled" });
  const next = hasher.hash(makeJob());
  worker.reply(2);
  expect(await next).toBe(value);
  hasher.dispose();
});

test("rejects stale and already aborted work before cloning, and rechecks freshness on completion", async () => {
  const worker = new WorkerFixture(),
    hasher = new CanonicalHasher({ createWorker: () => worker });
  const abort = new AbortController();
  abort.abort();
  await expect(hasher.hash(makeJob(), { signal: abort.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  await expect(hasher.hash(makeJob(), { isCurrent: () => false })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(worker.postMessage).not.toHaveBeenCalled();
  let current = true;
  const pending = hasher.hash(makeJob(), { isCurrent: () => current });
  current = false;
  worker.reply(1);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  hasher.dispose();
});

test.each(["invalid", "error", "decode"])(
  "terminates a failed worker (%s), rejects all jobs, and allows retry",
  async (kind) => {
    const workers: WorkerFixture[] = [],
      hasher = new CanonicalHasher({
        createWorker: () => {
          const worker = new WorkerFixture();
          workers.push(worker);
          return worker;
        },
      });
    const first = hasher.hash(makeJob()),
      second = hasher.hash(makeJob()),
      worker = workers[0]!;
    const firstFailure = expect(first).rejects.toThrow(),
      secondFailure = expect(second).rejects.toThrow();
    if (kind === "invalid") worker.reply(1, { value: "broken" });
    else if (kind === "error") worker.onerror?.(new ErrorEvent("error"));
    else worker.onmessageerror?.(new MessageEvent("messageerror"));
    await firstFailure;
    await secondFailure;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const retry = hasher.hash(makeJob());
    workers[1]!.reply(3);
    expect(await retry).toBe(value);
    hasher.dispose();
  },
);

test("cleans abort listeners/timers on post errors, task failures, timeout and disposal", async () => {
  vi.useFakeTimers();
  const worker = new WorkerFixture(),
    hasher = new CanonicalHasher({ createWorker: () => worker, timeoutMs: 50 });
  worker.postMessage.mockImplementationOnce(() => {
    throw new Error("clone");
  });
  await expect(hasher.hash(makeJob())).rejects.toThrow("clone");
  const failed = hasher.hash(makeJob());
  worker.reply(2, { error: "digest" });
  await expect(failed).rejects.toThrow("digest");
  const timeout = hasher.hash(makeJob()),
    timedOut = expect(timeout).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(50);
  await timedOut;
  const abort = new AbortController(),
    remove = vi.spyOn(abort.signal, "removeEventListener");
  const disposed = hasher.hash(makeJob(), { signal: abort.signal }),
    failure = expect(disposed).rejects.toMatchObject({ name: "AbortError" });
  hasher.dispose();
  await failure;
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

test("fallback snapshots mutable inputs and permits concurrent computations for transaction races", async () => {
  const gates: ((value: string) => void)[] = [];
  const compute = vi.fn(
    (_job: CanonicalHashJob) =>
      new Promise<string>((resolve) => {
        gates.push(resolve);
      }),
  );
  const hasher = new CanonicalHasher({ createWorker: () => null, compute });
  const job = makeJob(),
    first = hasher.hash(job),
    second = hasher.hash(makeJob());
  if (job.kind === "history") job.state.name = "Mutated";
  expect(compute).toHaveBeenCalledTimes(2);
  expect(compute.mock.calls[0]![0]).not.toBe(job);
  gates[1]!(value);
  expect(await second).toBe(value);
  gates[0]!(value);
  expect(await first).toBe(value);
  hasher.dispose();
});

test("fallback computes real digests and validates constructor limits", async () => {
  vi.stubGlobal("Worker", undefined);
  const hasher = new CanonicalHasher();
  expect(await hasher.hash(makeJob())).toMatch(/^[a-f0-9]{64}$/);
  hasher.dispose();
  for (const maxPending of [0, 9, 1.5])
    expect(() => new CanonicalHasher({ maxPending })).toThrow("limits");
  for (const timeoutMs of [0, Infinity])
    expect(() => new CanonicalHasher({ timeoutMs })).toThrow("limits");
});
