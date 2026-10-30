import { expect, it, vi } from "vitest";
import { BankAudioCache } from "../../../../../src/services/motion/audio/bank/cache";
import type { BankWorkerClient } from "../../../../../src/services/motion/audio/bank/client";
import type {
  BankOwner,
  BankPcm,
  BankShapeData,
} from "../../../../../src/services/motion/audio/bank/model";
import { generateBankShapes } from "../../../../../../../scripts/audio/bank";
function fixture(data: BankShapeData = generateBankShapes()) {
  const pending = new Map<
    string,
    { owner: BankOwner; resolve(value: BankPcm): void; reject(error: unknown): void }
  >();
  const client = {
    prepare: vi.fn(
      (owner: BankOwner, id: string) =>
        new Promise<BankPcm>((resolve, reject) => pending.set(id, { owner, resolve, reject })),
    ),
    prioritize: vi.fn(),
    cancel: vi.fn((owner: BankOwner) => {
      for (const [id, job] of pending)
        if (job.owner === owner) {
          pending.delete(id);
          job.reject(new DOMException("Retired", "AbortError"));
        }
    }),
    dispose: vi.fn(),
  };
  const cache = new BankAudioCache(client as unknown as BankWorkerClient),
    owner: BankOwner = { kind: "sound-bank", token: Symbol() },
    copy = vi.fn(),
    context = { createBuffer: vi.fn(() => ({ copyToChannel: copy })) } as unknown as AudioContext;
  function finish(id: string, revision?: string) {
    const shape = data.shapes.find((shape) => shape.id === id)!;
    pending.get(id)!.resolve({
      preset: id,
      revision: revision ?? shape.revision,
      frames: shape.frames,
      pcm: new Float32Array(shape.frames),
      blob: new Blob([new Uint8Array(44 + shape.frames * 2)], { type: "audio/wav" }),
    });
    pending.delete(id);
  }
  return { cache, owner, client, context, copy, finish, data };
}
it("prewarms a finite queue, prioritizes the hovered cue, and caches PCM or native buffers across bank owners", async () => {
  const d = fixture(),
    id = d.data.shapes[0]!.id;
  void d.cache.open(d.owner, d.data);
  expect(d.client.prepare).toHaveBeenCalledTimes(15);
  const result = d.cache.buffer(d.owner, id, d.context);
  expect(d.client.prioritize).toHaveBeenCalledWith(d.owner, id);
  d.finish(id);
  const first = await result;
  expect(d.copy).toHaveBeenCalledOnce();
  expect((await d.cache.buffer(d.owner, id, d.context)).buffer).toBe(first.buffer);
  expect(d.context.createBuffer).toHaveBeenCalledOnce();
  expect(d.cache.original(id)).toBeTruthy();
  const replacement: BankOwner = { kind: "sound-bank", token: Symbol() };
  d.cache.close(d.owner);
  void d.cache.open(replacement, d.data);
  d.cache.close(d.owner);
  expect((await d.cache.buffer(replacement, id, d.context)).buffer).toBe(first.buffer);
  expect(d.client.prepare.mock.calls.filter((call) => call[1] === id)).toHaveLength(1);
  d.cache.dispose();
  expect(d.cache.original(id)).toBeNull();
  expect(d.client.dispose).toHaveBeenCalledOnce();
  await expect(d.cache.buffer(replacement, id, d.context)).rejects.toMatchObject({
    name: "AbortError",
  });
});
it("rejects changed originals and never stores falsely successful PCM", async () => {
  const d = fixture(),
    id = d.data.shapes[0]!.id;
  void d.cache.open(d.owner, d.data);
  const result = d.cache.buffer(d.owner, id, d.context);
  d.finish(id, "sha256:wrong");
  await expect(result).rejects.toThrow("immutable WAV original");
  expect(d.cache.original(id)).toBeNull();
  expect(d.context.createBuffer).not.toHaveBeenCalled();
  d.cache.dispose();
});
it("enforces separate WAV/native-PCM budgets and releases evicted native references", async () => {
  const base = generateBankShapes(),
    data = {
      ...base,
      shapes: base.shapes.map((shape, index) => (index < 2 ? { ...shape, frames: 600000 } : shape)),
    },
    d = fixture(data),
    a = data.shapes[0]!.id,
    b = data.shapes[1]!.id;
  void d.cache.open(d.owner, data);
  const first = d.cache.buffer(d.owner, a, d.context);
  d.finish(a);
  await first;
  const second = d.cache.buffer(d.owner, b, d.context);
  d.finish(b);
  await second;
  expect(d.cache.original(a)).toBeNull();
  expect(d.cache.original(b)).toBeTruthy();
  d.cache.dispose();
});
