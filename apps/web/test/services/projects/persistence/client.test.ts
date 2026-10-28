import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PersistenceClient } from "../../../../src/services/projects/persistence/client";
import { createPersistenceHost } from "../../../../src/services/projects/persistence/host";
import { PersistenceUncertainError } from "../../../../src/services/projects/persistence/protocol";
import type {
  PersistenceRequest,
  PersistenceResponse,
  PersistenceWorkerPort,
} from "../../../../src/services/projects/persistence/model";
import { fixture } from "./fixtures";

class Bridge implements PersistenceWorkerPort {
  onmessage: PersistenceWorkerPort["onmessage"] = null;
  onerror: PersistenceWorkerPort["onerror"] = null;
  onmessageerror: PersistenceWorkerPort["onmessageerror"] = null;
  messages: PersistenceRequest["type"][] = [];
  stopped = false;
  reply = (data: PersistenceResponse) => this.onmessage?.({ data } as MessageEvent);
  readonly host = createPersistenceHost((data) => this.reply(data));
  terminate = vi.fn(() => {
    this.stopped = true;
  });
  postMessage(value: PersistenceRequest) {
    this.messages.push(value.type);
    const copy = structuredClone(value);
    queueMicrotask(() => {
      if (!this.stopped) this.host.receive(copy);
    });
  }
  crash() {
    this.onerror?.({ message: "Worker lost", preventDefault: vi.fn() } as unknown as ErrorEvent);
  }
}
const clients: PersistenceClient[] = [];
const bridges: Bridge[] = [];
const databases: Awaited<ReturnType<typeof fixture>>["db"][] = [];
beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
  await Promise.all(bridges.splice(0).map((bridge) => bridge.host.dispose()));
  databases.splice(0).forEach((db) => db.close());
  vi.unstubAllGlobals();
});
async function setup(options: ConstructorParameters<typeof PersistenceClient>[2] = {}) {
  const d = await fixture(),
    bridge = new Bridge(),
    factory = vi.fn(() => bridge),
    yieldTask = vi.fn(async (_signal: AbortSignal, _foreground: boolean) => {}),
    client = new PersistenceClient(d.db.name, async () => d.db, {
      worker: factory,
      yieldTask,
      ...options,
    });
  databases.push(d.db);
  bridges.push(bridge);
  clients.push(client);
  return { ...d, bridge, factory, yieldTask, client };
}
function thumbnail() {
  return {
    projectId: "project",
    pageId: "page",
    revision: "pixel-revision",
    width: 10,
    height: 10,
    updatedAt: "2026-10-28T12:00:00.000Z",
    blob: new Blob(["pixels"], { type: "image/webp" }),
  };
}
it("historical previews are opt-in, bounded to live pages and never written back as current", async () => {
  const d = await setup(),
    first = await d.client.save(d.frame);
  await d.client.thumbnail(thumbnail());
  await d.client.save({
    ...d.frame,
    expectedRevision: first.writeRevision,
    pageRevisions: { page: "new-paint" },
  });
  expect(await d.client.thumbnails("project", ["page"])).toEqual([]);
  const historical = await d.client.thumbnails("project", ["page"], true);
  expect(historical).toMatchObject([{ pageId: "page", revision: "pixel-revision", stale: true }]);
  expect((await d.db.get("projects", "project"))!.pageRevisions).toEqual({ page: "new-paint" });
  expect(await d.db.get("thumbnails", ["project", "page"])).not.toHaveProperty("stale");
  await expect(d.client.thumbnail(historical[0]!)).rejects.toThrow("Invalid thumbnail");
});
it("persists through the real host, reuses one worker and returns only bounded thumbnail results", async () => {
  const d = await setup(),
    result = await d.client.save(d.frame);
  expect(result).toMatchObject({ projectId: "project", assetsRevision: expect.any(String) });
  expect((await d.db.get("projects", "project"))!.project.name).toBe(d.project.name);
  expect(await d.client.thumbnail(thumbnail())).toBe(true);
  expect(await d.client.info("project")).toMatchObject([{ pageId: "page", bytes: 6 }]);
  const ids = ["page"],
    loading = d.client.thumbnails("project", ids);
  ids[0] = "later-mutation";
  expect(await loading).toMatchObject([{ pageId: "page", blob: expect.any(Blob) }]);
  expect(await d.client.thumbnails("project", [])).toEqual([]);
  await expect(d.client.thumbnails("project", Array(101).fill("page"))).rejects.toThrow(
    "selection",
  );
  expect(d.factory).toHaveBeenCalledOnce();
  const parts = d.bridge.messages.filter((type) => type === "part").length;
  expect(d.yieldTask).toHaveBeenCalledTimes(parts);
  expect(d.bridge.onmessage).toBeNull();
  await d.client.dispose();
  await d.client.dispose();
  expect(d.bridge.terminate).toHaveBeenCalledOnce();
  expect(d.bridge.onerror).toBeNull();
  await expect(d.client.info("project")).rejects.toThrow("disposed");
});
it("captures thumbnail metadata once before FIFO admission while retaining the immutable Blob", async () => {
  const d = await setup();
  await d.client.save(d.frame);
  const record = thumbnail(),
    accepted = { ...record },
    getter = vi.fn(() => accepted.pageId);
  Object.defineProperty(record, "pageId", { configurable: true, enumerable: true, get: getter });
  const pending = d.client.thumbnail(record);
  Object.defineProperty(record, "pageId", { value: "other" });
  record.revision = "later";
  record.blob = new Blob(["different"]);
  expect(await pending).toBe(true);
  expect(getter).toHaveBeenCalledOnce();
  const actual = await d.db.get("thumbnails", ["project", "page"]);
  expect(actual).toMatchObject({ pageId: "page", revision: accepted.revision });
  expect(await actual!.blob.text()).toBe("pixels");
});
it("preserves a remote quota failure without replaying it or discarding a healthy worker", async () => {
  const d = await setup(),
    native = IDBObjectStore.prototype.put,
    put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "projects") throw new DOMException("Full", "QuotaExceededError");
      return native.apply(this, args);
    });
  await expect(d.client.save(d.frame)).rejects.toMatchObject({ name: "QuotaExceededError" });
  expect(await d.db.count("assets")).toBe(0);
  expect(d.bridge.terminate).not.toHaveBeenCalled();
  put.mockRestore();
  await expect(d.client.save(d.frame)).resolves.toHaveProperty("projectId", "project");
  expect(d.factory).toHaveBeenCalledOnce();
});
it.each(["lost", "wrong-project", "wrong-kind"])(
  "reports an uncertain %s acknowledgment after an actual commit without retrying the write",
  async (mode) => {
    const d = await setup();
    d.bridge.reply = (response) => {
      if (!("result" in response) || response.result.kind !== "save") return;
      if (mode === "lost") d.bridge.crash();
      else
        d.bridge.onmessage?.({
          data: {
            id: response.id,
            result:
              mode === "wrong-kind"
                ? { kind: "thumbnail", value: true }
                : {
                    kind: "save",
                    value: { ...response.result.value, projectId: "foreign-project" },
                  },
          },
        } as MessageEvent);
    };
    await expect(d.client.save(d.frame)).rejects.toBeInstanceOf(PersistenceUncertainError);
    expect((await d.db.get("projects", "project"))!.project.name).toBe(d.project.name);
    expect(d.bridge.messages.filter((type) => type === "finish")).toHaveLength(1);
    expect(d.factory).toHaveBeenCalledOnce();
    expect(d.bridge.terminate).toHaveBeenCalledOnce();
  },
);
it("retires a worker after a partial-frame rejection before accepting another request", async () => {
  const d = await setup();
  d.bridge.postMessage = (message) => {
    if (message.type === "part")
      d.bridge.onmessage?.({
        data: { id: message.id, error: { name: "Error", message: "Invalid fragment" } },
      } as MessageEvent);
  };
  await expect(d.client.save(d.frame)).rejects.toThrow("Invalid fragment");
  expect(d.bridge.terminate).toHaveBeenCalledOnce();
  expect(d.bridge.onmessage).toBeNull();
  expect(await d.db.count("projects")).toBe(0);
});
it("admits 100 lightweight reads independently from eight mutations, then drains accepted work on close", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    yieldTask = vi.fn(async (_signal: AbortSignal, _foreground: boolean) => gate),
    d = await setup({ yieldTask }),
    writing = d.client.save(d.frame),
    reads = Array.from({ length: 100 }, () => d.client.info("project")),
    blobs = Array.from({ length: 7 }, () => d.client.thumbnail(thumbnail()));
  await expect(d.client.thumbnail(thumbnail())).rejects.toThrow("queue is full");
  const closing = d.client.dispose();
  await expect(d.client.info("project")).rejects.toThrow("disposed");
  release();
  await expect(writing).resolves.toHaveProperty("projectId", "project");
  expect(await Promise.all(reads)).toHaveLength(100);
  expect(await Promise.all(blobs)).toEqual(Array(7).fill(true));
  await closing;
  expect(yieldTask.mock.calls.some(([, foreground]) => foreground)).toBe(true);
  expect(d.bridge.terminate).toHaveBeenCalledOnce();
});
it("bounds queued reads and preserves a failed write rejection while cleanup drains", async () => {
  const d = await setup({ worker: () => null });
  const reads = Array.from({ length: 128 }, () => d.client.info("project"));
  await expect(d.client.info("project")).rejects.toThrow("queue is full");
  expect(await Promise.all(reads)).toHaveLength(128);
  await d.client.save(d.frame);
  const failure = d.client.save(d.frame),
    rejected = expect(failure).rejects.toHaveProperty("code", "STALE_PROJECT_WRITE");
  await d.client.dispose();
  await rejected;
});
it.each(["absent", "blocked"])(
  "uses the same atomic fallback when the worker is %s and rejects corrupt read results",
  async (mode) => {
    const d = await setup({
      worker: () => {
        if (mode === "blocked") throw Error("Worker startup blocked");
        return null;
      },
    });
    await d.client.save(d.frame);
    expect(await d.client.thumbnail(thumbnail())).toBe(true);
    expect(await d.client.thumbnails("project")).toHaveLength(1);
    const current = (await d.db.get("projects", "project"))!;
    current.thumbnailInfo![0]!.width = 999;
    await d.db.put("projects", current);
    await expect(d.client.info("project")).rejects.toThrow("Malformed");
  },
);
it("cleans timeout and message-decode failures without labeling read failures as uncertain saves", async () => {
  const d = await setup({ timeout: 10 });
  d.bridge.postMessage = () => {};
  vi.useFakeTimers();
  const reading = d.client.info("project"),
    rejected = expect(reading).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(20);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
  expect(d.bridge.terminate).toHaveBeenCalledOnce();
  const decoded = d.client.info("project"),
    decodingFailure = expect(decoded).rejects.toThrow("decoded");
  await vi.advanceTimersByTimeAsync(0);
  d.bridge.onmessageerror?.({} as MessageEvent);
  await decodingFailure;
  expect(vi.getTimerCount()).toBe(0);
});
