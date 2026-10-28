import { expect, it, vi } from "vitest";
it("returns bounded previews and transfers only an explicitly exported mask", async () => {
  const post = vi.fn(),
    previous = globalThis.onmessage;
  vi.stubGlobal("postMessage", post);
  try {
    await import("../../../../src/services/selection/wand/wand.worker");
    const send = (data: unknown) =>
      globalThis.onmessage!.call(window, new MessageEvent("message", { data }));
    send({
      id: 1,
      type: "source",
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([10, 10, 10, 255]),
    });
    expect(post.mock.calls.at(-1)![1]).toEqual([]);
    send({ id: 2, type: "preview", x: 0, y: 0, tolerance: 0, mode: "new", contiguous: true });
    send({ id: 3, type: "accept" });
    send({ id: 4, type: "export" });
    const [response, transfer] = post.mock.calls.at(-1)!;
    expect(response.mask.data).toEqual(new Uint8ClampedArray([255, 255, 255, 255]));
    expect(transfer).toEqual([response.mask.data.buffer]);
  } finally {
    globalThis.onmessage = previous;
    vi.unstubAllGlobals();
  }
});
