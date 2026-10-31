import { afterEach, expect, test, vi } from "vitest";
import { encodeManagedImage, type PrintEncodingRequest } from "../../src/export/print/encode";
import { DEFAULT_PRINT } from "../../src/export/print/layout";

class NativeWorker {
  static instances: NativeWorker[] = [];
  static failPost = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn(() => {
    if (NativeWorker.failPost) throw new Error("Cannot transfer file");
  });
  constructor() {
    NativeWorker.instances.push(this);
  }
}
const request: PrintEncodingRequest = {
  blob: new Blob(["native PNG"]),
  width: 10,
  height: 10,
  name: "Artwork",
  options: { format: "pdf", quality: 1, colorMode: "cmyk", print: DEFAULT_PRINT },
};
afterEach(() => {
  vi.unstubAllGlobals();
  NativeWorker.instances = [];
  NativeWorker.failPost = false;
});
function worker() {
  vi.stubGlobal("Worker", NativeWorker);
}
test("cancel terminates real worker ownership, rejects immediately and ignores a late result", async () => {
  worker();
  const controller = new AbortController(),
    result = encodeManagedImage(request, controller.signal);
  const current = NativeWorker.instances[0]!;
  const failure = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await failure;
  expect(current.terminate).toHaveBeenCalledOnce();
  current.onmessage?.(new MessageEvent("message", { data: { blob: new Blob(["late"]) } }));
});
test("pre-cancelled work allocates no worker", () => {
  worker();
  const controller = new AbortController();
  controller.abort();
  expect(() => encodeManagedImage(request, controller.signal)).toThrow();
  expect(NativeWorker.instances).toHaveLength(0);
});
test.each(["file", "empty", "failure", "transport"] as const)(
  "%s completion releases the worker and reports the actual outcome",
  async (kind) => {
    worker();
    NativeWorker.failPost = kind === "transport";
    const result = encodeManagedImage(request),
      current = NativeWorker.instances[0]!;
    if (kind === "transport") await expect(result).rejects.toThrow("Cannot transfer file");
    else if (kind === "failure") {
      current.onerror?.(new ErrorEvent("error", { message: "Codec failed" }));
      await expect(result).rejects.toThrow("Codec failed");
    } else {
      const blob = new Blob(kind === "empty" ? [] : ["encoded file"]);
      current.onmessage?.(new MessageEvent("message", { data: { blob } }));
      if (kind === "empty") await expect(result).rejects.toThrow("no file");
      else expect(await result).toBe(blob);
    }
    expect(current.terminate).toHaveBeenCalledOnce();
  },
);
