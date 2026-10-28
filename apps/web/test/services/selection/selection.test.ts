import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SelectionClient,
  type MaskResult,
  type SelectionResponse,
  type WorkerPort,
} from "../../../src/services/selection/selection";
function worker(): WorkerPort {
  return { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
}
function reply(port: WorkerPort, data: SelectionResponse) {
  port.onmessage?.({ data } as MessageEvent<SelectionResponse>);
}
const mask: MaskResult = { data: new Uint8ClampedArray([255, 255, 255, 255]), width: 1, height: 1 };
afterEach(() => vi.unstubAllGlobals());
describe("bounded selection worker client", () => {
  it("retains requests during real progress, reports completion and clears undecodable workers", async () => {
    const port = worker(),
      client = new SelectionClient(() => port);
    const pending = client.model.prepare();
    reply(port, {
      id: 1,
      progress: { file: "vision_encoder.onnx", status: "progress", loaded: 100 },
    });
    expect(client.model.read()).toMatchObject({ phase: "loading", loaded: 100 });
    reply(port, { id: 1, result: null });
    await pending;
    expect(client.model.read().phase).toBe("ready");
    const bad = client.prepare();
    port.onmessageerror?.({} as MessageEvent);
    await expect(bad).rejects.toThrow("could not be decoded");
    expect(port.onmessage).toBeNull();
    expect(port.onerror).toBeNull();
    expect(port.terminate).toHaveBeenCalledOnce();
    client.dispose();
  });
  it("lazily connects, reuses one worker and ignores stale responses", async () => {
    const port = worker();
    const factory = vi.fn(() => port);
    const client = new SelectionClient(factory);
    expect(factory).not.toHaveBeenCalled();
    const preparing = client.prepare();
    expect(factory).toHaveBeenCalledTimes(1);
    reply(port, { id: 999, result: null });
    await expect(client.prepare()).rejects.toThrow("déjà");
    reply(port, { id: 1, result: null });
    await preparing;
    const selecting = client.segment("image", 10, 20);
    expect(port.postMessage).toHaveBeenLastCalledWith(
      { id: 3, type: "segment", dataUrl: "image", x: 10, y: 20 },
      [],
    );
    reply(port, { id: 3, result: mask });
    expect(await selecting).toEqual(mask);
    expect(factory).toHaveBeenCalledTimes(1);
    client.dispose();
  });
  it("transfers magic-wand source buffers and rejects absent masks or worker errors", async () => {
    const port = worker();
    const client = new SelectionClient(() => port);
    const pixels = new Uint8ClampedArray(4);
    const selecting = client.wand(pixels, 1, 1, 0, 0, 16);
    expect(port.postMessage).toHaveBeenCalledWith(
      { id: 1, type: "wand", pixels, width: 1, height: 1, x: 0, y: 0, tolerance: 16 },
      [pixels.buffer],
    );
    reply(port, { id: 1, result: mask });
    expect(await selecting).toBe(mask);
    const missing = client.segment("a", 0, 0);
    reply(port, { id: 2, result: null });
    await expect(missing).rejects.toThrow("Masque absent");
    const missingWand = client.wand(pixels, 1, 1, 0, 0, 16);
    reply(port, { id: 3, result: null });
    await expect(missingWand).rejects.toThrow("Masque absent");
    const failed = client.prepare();
    reply(port, { id: 4, error: "Model unavailable" });
    await expect(failed).rejects.toThrow("Model unavailable");
    client.dispose();
  });
  it("terminates crashed workers, rejects pending requests and reconnects for retries", async () => {
    const first = worker(),
      second = worker();
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValue(second);
    const client = new SelectionClient(factory);
    const pending = client.segment("a", 1, 1);
    first.onerror?.({ message: "Worker crash" } as ErrorEvent);
    await expect(pending).rejects.toThrow("Worker crash");
    expect(first.terminate).toHaveBeenCalledTimes(1);
    const retry = client.prepare();
    second.onerror?.({ message: "" } as ErrorEvent);
    await expect(retry).rejects.toThrow("worker de sélection");
    client.dispose();
  });
  it("supports disposal before creation, during a request and after a stale response", async () => {
    const port = worker();
    const client = new SelectionClient(() => port);
    client.dispose();
    const pending = client.segment("a", 0, 0);
    client.dispose();
    await expect(pending).rejects.toThrow("annulée");
    expect(port.terminate).toHaveBeenCalledTimes(1);
    reply(port, { id: 1, result: mask });
    port.onerror?.({ message: "Late error" } as ErrorEvent);
    client.dispose();
  });
  it("constructs the browser module worker by default", async () => {
    const port = worker();
    const constructor = vi.fn(function () {
      return port;
    });
    vi.stubGlobal("Worker", constructor);
    const client = new SelectionClient();
    const promise = client.prepare();
    expect(constructor).toHaveBeenCalledWith(expect.any(URL), { type: "module" });
    reply(port, { id: 1, result: null });
    await promise;
    client.dispose();
  });
  it("clears a request when postMessage cannot transfer its payload", async () => {
    const port = worker();
    vi.mocked(port.postMessage).mockImplementationOnce(() => {
      throw new Error("Transfer failed");
    });
    const client = new SelectionClient(() => port);
    await expect(client.prepare()).rejects.toThrow("Transfer failed");
    const retry = client.prepare();
    reply(port, { id: 2, result: null });
    await retry;
    client.dispose();
  });
});
