import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock("../../../../src/services/motion/audio/worker-host", () => ({
  handleAudioWorkerJob: state.handle,
}));
it("transfers waveform storage from the worker and returns WAV blobs without an invalid transfer list", async () => {
  const post = vi.fn(),
    scope = globalThis as unknown as {
      postMessage: typeof post;
      onmessage: ((event: unknown) => void) | null;
    };
  const previous = { post: scope.postMessage, message: scope.onmessage };
  scope.postMessage = post;
  try {
    await import("../../../../src/services/motion/audio/audio.worker");
    const peaks = new Float32Array(4);
    state.handle.mockResolvedValueOnce({ id: 1, peaks });
    scope.onmessage!({ data: { id: 1 } });
    await Promise.resolve();
    await Promise.resolve();
    expect(post).toHaveBeenCalledWith({ id: 1, peaks }, [peaks.buffer]);
    const blob = new Blob(["wav"]);
    state.handle.mockResolvedValueOnce({ id: 2, blob });
    scope.onmessage!({ data: { id: 2 } });
    await Promise.resolve();
    await Promise.resolve();
    expect(post).toHaveBeenCalledWith({ id: 2, blob }, []);
  } finally {
    scope.postMessage = previous.post;
    scope.onmessage = previous.message;
  }
});
