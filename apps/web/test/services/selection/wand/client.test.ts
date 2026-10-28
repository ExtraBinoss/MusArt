import { afterEach, expect, it, vi } from "vitest";
import { WandClient, type WandWorkerPort } from "../../../../src/services/selection/wand/client";
import type { WandResponse } from "../../../../src/services/selection/wand/model";
const clients: WandClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
  vi.useRealTimers();
});
function fixture(timeout = 100) {
  const worker: WandWorkerPort = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
      onmessageerror: null,
    },
    client = new WandClient(worker, timeout);
  clients.push(client);
  const respond = (data: WandResponse) =>
    worker.onmessage?.({ data } as MessageEvent<WandResponse>);
  return { worker, client, respond };
}
it("transfers originals once, rejects overlap and ignores stale response identifiers", async () => {
  const d = fixture(),
    data = new Uint8ClampedArray(4),
    pending = d.client.request({ type: "source", data, width: 1, height: 1 });
  expect(d.worker.postMessage).toHaveBeenCalledWith(
    { id: 1, type: "source", data, width: 1, height: 1 },
    [data.buffer],
  );
  await expect(d.client.request({ type: "accept" })).rejects.toThrow("already processing");
  d.respond({ id: 2, error: "stale" });
  const preview = { width: 1, height: 1, path: "", selected: 0, simplified: false };
  d.respond({ id: 1, preview });
  await expect(pending).resolves.toEqual({ id: 1, preview });
  const failed = d.client.request({ type: "accept" });
  d.respond({ id: 2, error: "actual failure" });
  await expect(failed).rejects.toThrow("actual failure");
});
it("cleans up failed posting, worker errors, decoding failures and owned timers", async () => {
  const d = fixture();
  vi.mocked(d.worker.postMessage).mockImplementationOnce(() => {
    throw Error("post failed");
  });
  await expect(d.client.request({ type: "accept" })).rejects.toThrow("post failed");
  const pending = d.client.request({ type: "accept" }),
    event = new ErrorEvent("error", { message: "device failure", cancelable: true });
  d.worker.onerror?.(event);
  await expect(pending).rejects.toThrow("device failure");
  expect(event.defaultPrevented).toBe(true);
  expect(d.worker.terminate).toHaveBeenCalledOnce();
  expect(d.worker.onmessage).toBeNull();
  await expect(d.client.request({ type: "accept" })).rejects.toThrow("closed");
  const decode = fixture(),
    decoding = decode.client.request({ type: "accept" });
  decode.worker.onmessageerror?.(new MessageEvent("messageerror"));
  await expect(decoding).rejects.toThrow("could not be decoded");
});
it("rejects silent workers on timeout and terminates only once", async () => {
  vi.useFakeTimers();
  const d = fixture(20),
    pending = d.client.request({ type: "accept" }),
    rejection = expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(20);
  await rejection;
  d.client.dispose();
  expect(d.worker.terminate).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("marks normal cancellation as AbortError and rejects pending work without late callbacks", async () => {
  const d = fixture(),
    pending = d.client.request({ type: "accept" });
  d.client.dispose();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(d.worker.onmessage).toBeNull();
  expect(d.worker.onerror).toBeNull();
  expect(d.worker.onmessageerror).toBeNull();
});
