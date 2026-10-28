import { afterEach, expect, test, vi } from "vitest";
import { createProject, stateFromProject } from "@musart/core";
import { createHashProcessor } from "../../../../src/services/serialization/hashing/hash.worker";
import type {
  CanonicalHashJob,
  HashRequest,
} from "../../../../src/services/serialization/hashing/protocol";

const job: CanonicalHashJob = { kind: "history", state: stateFromProject(createProject()) };
const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
afterEach(() => vi.unstubAllGlobals());

test("computes jobs FIFO, cancels queued and active work, and continues after a failure", async () => {
  const reply = vi.fn();
  let release!: (value: string) => void;
  const compute = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error("Hash failed"))
    .mockResolvedValue("b".repeat(64));
  const process = createHashProcessor(reply, compute);
  for (let id = 1; id <= 4; id++) process({ type: "hash", id, job });
  expect(compute).toHaveBeenCalledTimes(1);
  process({ type: "cancel", id: 2 });
  process({ type: "cancel", id: 1 });
  process({ type: "cancel", id: 99 });
  release("a".repeat(64));
  await turn();
  expect(reply.mock.calls.map(([value]) => value)).toEqual([
    { id: 2, error: "Hash cancelled." },
    { id: 1, error: "Hash cancelled." },
    { id: 3, error: "Hash failed" },
    { id: 4, value: "b".repeat(64) },
  ]);
  expect(compute).toHaveBeenCalledTimes(3);
});

test("bounds physical queued snapshots and reports unknown computation failures", async () => {
  const reply = vi.fn();
  let reject!: (error: unknown) => void;
  const process = createHashProcessor(
    reply,
    () =>
      new Promise<string>((_resolve, fail) => {
        reject = fail;
      }),
  );
  for (let id = 1; id <= 9; id++) process({ type: "hash", id, job });
  expect(reply).toHaveBeenCalledWith({ id: 9, error: "Hash queue is full." });
  for (let id = 2; id <= 8; id++) process({ type: "cancel", id });
  reject("unknown");
  await turn();
  expect(reply).toHaveBeenCalledWith({ id: 1, error: "Hash failed." });
});

test("module worker handler posts a real canonical digest", async () => {
  const post = vi.fn();
  vi.stubGlobal("postMessage", post);
  const request: HashRequest = { type: "hash", id: 12, job };
  globalThis.onmessage!.call(window, new MessageEvent("message", { data: request }));
  await vi.waitFor(() =>
    expect(post).toHaveBeenCalledWith({ id: 12, value: expect.stringMatching(/^[a-f0-9]{64}$/) }),
  );
});
