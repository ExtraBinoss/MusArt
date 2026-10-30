import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("../../../../../src/services/motion/audio/bank/worker-host", () => ({
  handleBankJob: state.handle,
}));
it("installs one worker bridge and preserves transferable ownership", async () => {
  const scope = globalThis as unknown as {
      onmessage: ((event: unknown) => void) | null;
      postMessage: ReturnType<typeof vi.fn>;
    },
    previous = { onmessage: scope.onmessage, postMessage: scope.postMessage },
    post = vi.fn();
  scope.postMessage = post;
  try {
    await import("../../../../../src/services/motion/audio/bank/bank.worker");
    state.handle.mockImplementationOnce((_job, send) =>
      send({ id: 1, type: "error", message: "real failure" }, []),
    );
    scope.onmessage!({ data: { id: 1, type: "prepare", preset: "soft-plop" } });
    expect(state.handle).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith({ id: 1, type: "error", message: "real failure" }, []);
  } finally {
    scope.onmessage = previous.onmessage;
    scope.postMessage = previous.postMessage;
  }
});
