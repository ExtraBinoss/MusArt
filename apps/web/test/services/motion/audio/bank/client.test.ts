import { expect, it, vi } from "vitest";
import { BankWorkerClient } from "../../../../../src/services/motion/audio/bank/client";
import type {
  BankJob,
  BankOwner,
  BankReply,
} from "../../../../../src/services/motion/audio/bank/model";
function fixture() {
  const messages: BankJob[] = [],
    worker = {
      postMessage: vi.fn((job: BankJob) => messages.push(job)),
      terminate: vi.fn(),
      onmessage: null as ((event: MessageEvent<BankReply>) => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
    },
    create = vi.fn(() => worker as unknown as Worker),
    client = new BankWorkerClient(create),
    owner: BankOwner = { kind: "sound-bank", token: Symbol() };
  const reply = (job: BankJob) =>
    worker.onmessage!({
      data: { id: job.id, type: "pcm", value: { preset: "test", pcm: new Float32Array(1) } },
    } as MessageEvent<BankReply>);
  return { client, worker, messages, create, owner, reply };
}
it("admits one job at a time, prioritizes the requested cue and reuses its idle worker", async () => {
  const d = fixture(),
    first = d.client.prepare(d.owner, "a"),
    second = d.client.prepare(d.owner, "b"),
    third = d.client.prepare(d.owner, "c");
  expect(d.messages).toHaveLength(1);
  expect(JSON.stringify(d.messages)).not.toContain("owner");
  d.client.prioritize(d.owner, "c");
  d.reply(d.messages[0]!);
  await first;
  expect(d.messages[1]).toMatchObject({ preset: "c" });
  d.reply(d.messages[1]!);
  await third;
  d.reply(d.messages[2]!);
  await second;
  expect(d.create).toHaveBeenCalledOnce();
  expect(d.worker.terminate).not.toHaveBeenCalled();
  d.client.dispose();
  expect(d.worker.terminate).toHaveBeenCalledOnce();
});
it("retires queued work immediately, drops late atlases, and never cancels a different owner", async () => {
  const d = fixture(),
    pending = d.client.prepare(d.owner, "a").catch((error) => error),
    queued = d.client.prepare(d.owner, "b").catch((error) => error),
    other: BankOwner = { kind: "sound-bank", token: Symbol() };
  d.client.cancel(other);
  expect(d.messages).toHaveLength(1);
  d.client.cancel(d.owner);
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(await queued).toMatchObject({ name: "AbortError" });
  d.reply(d.messages[0]!);
  expect(d.messages).toHaveLength(1);
  const atlas = d.client.atlas(other, {} as never).catch((error) => error),
    bitmap = { neutral: { close: vi.fn() }, active: { close: vi.fn() } };
  d.client.cancel(other);
  d.worker.onmessage!({
    data: { id: d.messages.at(-1)!.id, type: "atlas", value: bitmap },
  } as never);
  expect(await atlas).toMatchObject({ name: "AbortError" });
  expect(bitmap.neutral.close).toHaveBeenCalledOnce();
  d.client.dispose();
  expect(d.worker.onmessage).toBeNull();
});
it("reports constructor/worker failures and bounds the finite queue", async () => {
  const broken = new BankWorkerClient(() => {
      throw Error("Worker unavailable");
    }),
    owner: BankOwner = { kind: "sound-bank", token: Symbol() };
  await expect(broken.prepare(owner, "a")).rejects.toThrow("Worker unavailable");
  broken.dispose();
  const d = fixture(),
    jobs = Array.from({ length: 16 }, (_, index) =>
      d.client.prepare(d.owner, String(index)).catch((error) => error),
    );
  await expect(d.client.prepare(d.owner, "overflow")).rejects.toThrow("bounded queue");
  d.worker.onerror!({
    message: "Worker crashed",
    preventDefault: vi.fn(),
  } as unknown as ErrorEvent);
  expect((await Promise.all(jobs)).every((value) => value instanceof Error)).toBe(true);
  expect(d.worker.terminate).toHaveBeenCalledOnce();
  d.client.dispose();
});
