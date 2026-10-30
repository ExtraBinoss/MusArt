import { closeAtlas } from "./geometry";
import type { BankAtlas, BankJob, BankOwner, BankPcm, BankReply } from "./model";
type Port = Pick<Worker, "postMessage" | "terminate" | "onmessage" | "onerror">;
type Input = BankJob extends infer T ? (T extends BankJob ? Omit<T, "id"> : never) : never;
interface Request {
  id: number;
  owner: BankOwner;
  input: Input;
  resolve(value: BankReply): void;
  reject(error: unknown): void;
  canceled: boolean;
}
const canceled = () => new DOMException("Sound-bank preparation canceled.", "AbortError");

/** One retained, idle-safe worker; <=15 recipes + one current atlas are admitted serially. */
export class BankWorkerClient {
  private worker: Port | null = null;
  private active: Request | null = null;
  private queue: Request[] = [];
  private sequence = 0;
  private closed = false;
  constructor(
    private readonly createWorker: () => Port = () =>
      new Worker(new URL("./bank.worker.ts", import.meta.url), { type: "module" }),
  ) {}
  prepare(owner: BankOwner, preset: string, priority = false): Promise<BankPcm> {
    return this.request(owner, { type: "prepare", preset }, priority).then((reply) => {
      if (reply.type !== "pcm") throw Error("Sound worker returned no PCM original.");
      return reply.value;
    });
  }
  atlas(
    owner: BankOwner,
    input: Omit<Extract<BankJob, { type: "atlas" }>, "id" | "type">,
  ): Promise<BankAtlas> {
    for (let index = this.queue.length - 1; index >= 0; index--) {
      const request = this.queue[index]!;
      if (request.owner === owner && request.input.type === "atlas") this.cancelRequest(request);
    }
    return this.request(owner, { type: "atlas", ...input }, true).then((reply) => {
      if (reply.type !== "atlas") throw Error("Sound worker returned no waveform atlas.");
      return reply.value;
    });
  }
  prioritize(owner: BankOwner, preset: string) {
    const index = this.queue.findIndex(
      (request) =>
        request.owner === owner &&
        request.input.type === "prepare" &&
        request.input.preset === preset,
    );
    if (index > 0) this.queue.unshift(...this.queue.splice(index, 1));
  }
  private request(owner: BankOwner, input: Input, priority: boolean): Promise<BankReply> {
    if (this.closed) return Promise.reject(canceled());
    if (this.queue.length + (this.active && !this.active.canceled ? 1 : 0) >= 16)
      return Promise.reject(Error("Sound-bank preparation reached its bounded queue."));
    const result = new Promise<BankReply>((resolve, reject) => {
      const request = { id: ++this.sequence, owner, input, resolve, reject, canceled: false };
      if (priority) this.queue.unshift(request);
      else this.queue.push(request);
    });
    try {
      this.pump();
    } catch (error) {
      this.fail(error);
    }
    return result;
  }
  private pump() {
    if (this.closed || this.active || !this.queue.length) return;
    if (!this.worker) {
      const worker = this.createWorker();
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<BankReply>) => {
        const reply = event.data,
          request = this.active;
        if (this.worker !== worker || !request || request.id !== reply.id) {
          if (reply.type === "atlas") closeAtlas(reply.value);
          return;
        }
        this.active = null;
        if (request.canceled) {
          if (reply.type === "atlas") closeAtlas(reply.value);
        } else if (reply.type === "error") request.reject(Error(reply.message));
        else request.resolve(reply);
        this.pump();
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        this.fail(Error(event.message || "Sound-bank worker failed."));
      };
    }
    const request = this.queue.shift()!;
    this.active = request;
    try {
      this.worker.postMessage({ ...request.input, id: request.id });
    } catch (error) {
      this.fail(error);
    }
  }
  private cancelRequest(request: Request) {
    request.canceled = true;
    request.reject(canceled());
    const index = this.queue.indexOf(request);
    if (index >= 0) this.queue.splice(index, 1);
  }
  cancel(owner: BankOwner) {
    for (let index = this.queue.length - 1; index >= 0; index--) {
      const request = this.queue[index]!;
      if (request.owner === owner) this.cancelRequest(request);
    }
    if (this.active?.owner === owner && !this.active.canceled) this.cancelRequest(this.active);
  }
  private fail(error: unknown) {
    const requests = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = null;
    this.queue = [];
    this.retire();
    for (const request of requests) if (!request.canceled) request.reject(error);
  }
  private retire() {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.fail(canceled());
  }
}
