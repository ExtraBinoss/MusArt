import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  receive: vi.fn(),
  send: null as null | ((value: unknown, transfer?: Transferable[]) => void),
}));
vi.mock("../../../../src/services/motion/audio/mixer-worker-host", () => ({
  createAudioMixerWorkerHost: (send: typeof state.send) => {
    state.send = send;
    return { receive: state.receive };
  },
}));
it("routes native worker jobs and PCM transfer lists through the bounded host", async () => {
  const scope = globalThis as unknown as {
      postMessage: (value: unknown, transfer?: Transferable[]) => void;
      onmessage: ((event: unknown) => void) | null;
    },
    previous = { post: scope.postMessage, message: scope.onmessage },
    post = vi.fn();
  scope.postMessage = post;
  try {
    await import("../../../../src/services/motion/audio/mixer.worker");
    scope.onmessage!({ data: { type: "close", id: 1 } });
    expect(state.receive).toHaveBeenCalledWith({ type: "close", id: 1 });
    const buffer = new ArrayBuffer(4);
    state.send!({ type: "pcm" }, [buffer]);
    expect(post).toHaveBeenCalledWith({ type: "pcm" }, [buffer]);
  } finally {
    scope.postMessage = previous.post;
    scope.onmessage = previous.message;
  }
});
