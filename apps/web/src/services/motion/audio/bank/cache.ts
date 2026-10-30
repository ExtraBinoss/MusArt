import { SFX_BANK } from "../sfx";
import { BankWorkerClient } from "./client";
import type { BankOwner, BankShapeData, BankPcm } from "./model";
export const BANK_WAV_BYTES = 2 * 1024 * 1024;
export const BANK_PCM_BYTES = 4 * 1024 * 1024;
interface Entry {
  readonly revision: string;
  readonly frames: number;
  readonly blob: Blob;
  pcm: Float32Array<ArrayBuffer> | null;
  buffer: AudioBuffer | null;
}
interface Pending {
  readonly owner: BankOwner;
  readonly promise: Promise<Entry>;
}
const canceled = () => new DOMException("Sound-bank owner retired.", "AbortError");

/** Project-independent immutable recipes. Each entry owns PCM OR a native buffer, never both. */
export class BankAudioCache {
  private owner: BankOwner | null = null;
  private data: BankShapeData | null = null;
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Pending>();
  private wavBytes = 0;
  private pcmBytes = 0;
  private closed = false;
  constructor(readonly client = new BankWorkerClient()) {}
  owns(owner: BankOwner) {
    return this.owner === owner;
  }
  ready(data: BankShapeData) {
    return data.shapes.every((shape) => this.entries.get(shape.id)?.revision === shape.revision);
  }
  open(owner: BankOwner, data: BankShapeData) {
    if (this.closed) throw canceled();
    if (this.owner && this.owner !== owner) this.close(this.owner);
    this.owner = owner;
    this.data = data;
    return Promise.allSettled(SFX_BANK.map((preset) => this.prepare(owner, preset.id)));
  }
  close(owner: BankOwner) {
    if (this.owner !== owner) return false;
    this.owner = null;
    this.client.cancel(owner);
    for (const [key, entry] of this.pending) if (entry.owner === owner) this.pending.delete(key);
    return true;
  }
  closeCurrent() {
    if (this.owner) this.close(this.owner);
  }
  original(id: string): Blob | null {
    return this.entries.get(id)?.blob ?? null;
  }
  private prepare(owner: BankOwner, id: string, priority = false): Promise<Entry> {
    if (this.closed || this.owner !== owner || !this.data) return Promise.reject(canceled());
    const shape = this.data.shapes.find((shape) => shape.id === id);
    if (!shape) return Promise.reject(Error("Unknown sound-bank recipe."));
    const existing = this.entries.get(id);
    if (existing?.revision === shape.revision) {
      this.entries.delete(id);
      this.entries.set(id, existing);
      return Promise.resolve(existing);
    }
    if (existing) this.drop(id, existing);
    const pending = this.pending.get(id);
    if (pending) {
      if (priority) this.client.prioritize(owner, id);
      return pending.promise;
    }
    const promise = this.client
      .prepare(owner, id, priority)
      .then((value: BankPcm) => {
        if (this.owner !== owner || this.closed) throw canceled();
        if (
          value.revision !== shape.revision ||
          value.frames !== shape.frames ||
          value.pcm.byteLength !== shape.frames * 4 ||
          value.blob.type !== "audio/wav" ||
          value.blob.size !== 44 + shape.frames * 2
        )
          throw Error("The sound-bank PCM does not match its immutable WAV original.");
        const entry: Entry = {
          revision: value.revision,
          frames: value.frames,
          blob: value.blob,
          pcm: value.pcm,
          buffer: null,
        };
        this.entries.set(id, entry);
        this.wavBytes += entry.blob.size;
        this.pcmBytes += entry.frames * 4;
        while (
          this.entries.size > 15 ||
          this.wavBytes > BANK_WAV_BYTES ||
          this.pcmBytes > BANK_PCM_BYTES
        ) {
          const key = this.entries.keys().next().value!;
          this.drop(key, this.entries.get(key)!);
        }
        if (!this.entries.has(id)) throw Error("Sound-bank cache budget exceeded.");
        return entry;
      })
      .finally(() => {
        if (this.pending.get(id)?.promise === promise) this.pending.delete(id);
      });
    this.pending.set(id, { owner, promise });
    return promise;
  }
  async buffer(owner: BankOwner, id: string, context: AudioContext) {
    const entry = await this.prepare(owner, id, true);
    if (this.owner !== owner) throw canceled();
    if (!entry.buffer) {
      const buffer = context.createBuffer(1, entry.frames, 48000);
      buffer.copyToChannel(entry.pcm!, 0);
      entry.buffer = buffer;
      entry.pcm = null;
    }
    return { buffer: entry.buffer, duration: entry.frames / 48000 };
  }
  private drop(id: string, entry: Entry) {
    this.entries.delete(id);
    this.wavBytes -= entry.blob.size;
    this.pcmBytes -= entry.frames * 4;
    entry.pcm = null;
    entry.buffer = null;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    if (this.owner) this.close(this.owner);
    this.client.dispose();
    for (const [id, entry] of this.entries) this.drop(id, entry);
    this.pending.clear();
    this.data = null;
  }
}
