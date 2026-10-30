import { expect, it, vi } from "vitest";
import type { AudioAsset } from "@musart/core";
import { AudioPreparation } from "../../../../src/services/motion/audio/preparation";
import type { AudioWorkerReply } from "../../../../src/services/motion/audio/worker-host";
const asset: AudioAsset = {
  id: "a",
  kind: "audio",
  name: "Audio",
  mime: "audio/wav",
  originalId: "o",
  contentRevision: "r",
  byteLength: 1,
  duration: { value: 1, rate: 1 },
  firstTimestamp: { value: 0, rate: 1 },
  timeResolution: 48000,
  channels: 1,
  sampleRate: 48000,
};
function setup() {
  const workers: {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage: ((event: MessageEvent<AudioWorkerReply>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
  }[] = [];
  const read = vi.fn(async () => new Blob(["x"]));
  const create = () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    workers.push(worker);
    return worker as unknown as Worker;
  };
  const preparation = new AudioPreparation(read, create);
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  return { preparation, read, workers, flush };
}
it("deduplicates originals, reads lazily and caches only bounded peaks while serializing work", async () => {
  const d = setup(),
    first = d.preparation.waveform(asset),
    duplicate = d.preparation.waveform({ ...asset });
  await d.flush();
  expect(d.read).toHaveBeenCalledOnce();
  expect(d.workers).toHaveLength(1);
  const worker = d.workers[0]!,
    job = worker.postMessage.mock.calls[0]![0];
  expect(worker.postMessage).toHaveBeenCalledOnce();
  const peaks = new Float32Array([0.25, 1]);
  worker.onmessage!({ data: { id: job.id, peaks } } as MessageEvent<AudioWorkerReply>);
  expect(await first).toBe(peaks);
  expect(await duplicate).toBe(peaks);
  const next = d.preparation.sfx("soft-plop");
  await d.flush();
  expect(worker.postMessage).toHaveBeenCalledTimes(2);
  worker.onmessage!({
    data: { id: worker.postMessage.mock.calls[1]![0].id, blob: new Blob(["sfx"]) },
  } as MessageEvent<AudioWorkerReply>);
  await next;
  expect(await d.preparation.waveform(asset)).toBe(peaks);
  expect(d.read).toHaveBeenCalledOnce();
  d.preparation.dispose();
});
it("rejects canceled/stale work, terminates native workers and does not reattach old results", async () => {
  const d = setup(),
    first = d.preparation.waveform(asset);
  await d.flush();
  const old = d.workers[0]!,
    stale = old.onmessage!;
  const queued = d.preparation.sfx("warm-chime");
  const firstError = first.catch((error: unknown) => error),
    queuedError = queued.catch((error: unknown) => error);
  d.preparation.reset();
  expect(await firstError).toMatchObject({ name: "AbortError" });
  expect(await queuedError).toMatchObject({ name: "AbortError" });
  expect(old.terminate).toHaveBeenCalledOnce();
  expect(old.onmessage).toBeNull();
  const fresh = d.preparation.waveform(asset);
  await d.flush();
  stale({ data: { id: 1, peaks: new Float32Array([1]) } } as MessageEvent<AudioWorkerReply>);
  const worker = d.workers.at(-1)!;
  worker.onmessage!({
    data: { id: worker.postMessage.mock.calls[0]![0].id, peaks: new Float32Array([0]) },
  } as MessageEvent<AudioWorkerReply>);
  expect([...(await fresh)]).toEqual([0]);
  d.preparation.dispose();
  await expect(d.preparation.sfx("soft-plop")).rejects.toMatchObject({ name: "AbortError" });
});
it("surfaces original-read and worker errors rather than caching fake successful waveforms", async () => {
  const d = setup();
  d.read.mockRejectedValueOnce(Error("original missing"));
  await expect(d.preparation.waveform(asset)).rejects.toThrow("original missing");
  const next = d.preparation.waveform(asset);
  await d.flush();
  const worker = d.workers[0]!;
  worker.onmessage!({
    data: { id: worker.postMessage.mock.calls[0]![0].id, error: "decode failed" },
  } as MessageEvent<AudioWorkerReply>);
  await expect(next).rejects.toThrow("decode failed");
  expect(worker.terminate).toHaveBeenCalledOnce();
  d.preparation.dispose();
});

it("gives SFX auditions priority and pauses background waveform decoding without rejecting observers", async () => {
  const d = setup(),
    waveform = d.preparation.waveform(asset);
  await d.flush();
  const old = d.workers[0]!;
  d.preparation.pauseWaveforms();
  expect(old.terminate).toHaveBeenCalledOnce();
  const sound = d.preparation.sfx("soft-plop");
  await d.flush();
  const worker = d.workers[1]!,
    job = worker.postMessage.mock.calls[0]![0];
  expect(job.type).toBe("sfx");
  worker.onmessage!({
    data: { id: job.id, blob: new Blob(["wav"]) },
  } as MessageEvent<AudioWorkerReply>);
  await sound;
  expect(worker.postMessage).toHaveBeenCalledOnce();
  d.preparation.resumeWaveforms();
  await d.flush();
  const resumed = worker.postMessage.mock.calls[1]![0];
  expect(resumed.type).toBe("waveform");
  worker.onmessage!({
    data: { id: resumed.id, peaks: new Float32Array([0.5]) },
  } as MessageEvent<AudioWorkerReply>);
  expect([...(await waveform)]).toEqual([0.5]);
  d.preparation.dispose();
});

it("deduplicates the sound and its visible envelope into one bounded worker result", async () => {
  const d = setup(),
    blob = d.preparation.sfx("soft-plop"),
    waveform = d.preparation.sfxWaveform("soft-plop");
  await d.flush();
  const worker = d.workers[0]!,
    job = worker.postMessage.mock.calls[0]![0],
    peaks = new Float32Array([0, 0.7, 0]),
    wav = new Blob(["wav"]);
  worker.onmessage!({ data: { id: job.id, blob: wav, peaks } } as MessageEvent<AudioWorkerReply>);
  expect(await blob).toBe(wav);
  expect(await waveform).toBe(peaks);
  expect(await d.preparation.sfxWaveform("soft-plop")).toBe(peaks);
  expect(worker.postMessage).toHaveBeenCalledOnce();
  d.preparation.dispose();
});
