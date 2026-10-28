import { expect, it, vi } from "vitest";
import { createPersistenceHost } from "../../../../src/services/projects/persistence/host";
vi.mock("../../../../src/services/projects/persistence/host", () => ({
  createPersistenceHost: vi.fn(),
}));
it("wires native worker messages and bounded acknowledgments through its owned host", async () => {
  const receive = vi.fn(),
    post = vi.fn(),
    previous = globalThis.onmessage;
  vi.mocked(createPersistenceHost).mockReturnValue({ receive, dispose: vi.fn(async () => {}) });
  vi.stubGlobal("postMessage", post);
  try {
    await import("../../../../src/services/projects/persistence/persistence.worker");
    globalThis.onmessage!.call(
      window,
      new MessageEvent("message", { data: { type: "finish", id: 1, parts: 1 } }),
    );
    expect(receive).toHaveBeenCalledExactlyOnceWith({ type: "finish", id: 1, parts: 1 });
    vi.mocked(createPersistenceHost).mock.calls[0]![0]({
      id: 1,
      result: { kind: "thumbnail", value: false },
    });
    expect(post).toHaveBeenCalledExactlyOnceWith({
      id: 1,
      result: { kind: "thumbnail", value: false },
    });
  } finally {
    globalThis.onmessage = previous;
    vi.unstubAllGlobals();
  }
});
