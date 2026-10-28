import { expect, it, vi } from "vitest";
import { createJournalHost } from "../../../../src/services/animation/journal/host";
vi.mock("../../../../src/services/animation/journal/host", () => ({ createJournalHost: vi.fn() }));
it("wires real worker messages and small replies through the shared host", async () => {
  const receive = vi.fn(),
    post = vi.fn(),
    previous = globalThis.onmessage;
  vi.mocked(createJournalHost).mockReturnValue({ receive, dispose: vi.fn(async () => {}) });
  vi.stubGlobal("postMessage", post);
  try {
    await import("../../../../src/services/animation/journal/journal.worker");
    globalThis.onmessage!.call(
      window,
      new MessageEvent("message", { data: { type: "finish", id: 1, parts: 1 } }),
    );
    expect(receive).toHaveBeenCalledExactlyOnceWith({ type: "finish", id: 1, parts: 1 });
    vi.mocked(createJournalHost).mock.calls[0]![0]({
      id: 1,
      error: { name: "Error", message: "Rejected" },
    });
    expect(post).toHaveBeenCalledExactlyOnceWith({
      id: 1,
      error: { name: "Error", message: "Rejected" },
    });
  } finally {
    globalThis.onmessage = previous;
    vi.unstubAllGlobals();
  }
});
