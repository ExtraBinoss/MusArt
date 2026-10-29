import { expect, it, vi } from "vitest";
import type { WebGPURenderer } from "three/webgpu";
import { settleVideoUpload } from "../../../src/sources/video/settle";
it("awaits the native WebGPU submission acknowledgement without mapping any buffer", async () => {
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const queue = { onSubmittedWorkDone: vi.fn(() => done) };
  let settled = false;
  const work = settleVideoUpload({
    backend: { device: { queue } },
  } as unknown as WebGPURenderer).then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  finish();
  await work;
  expect(queue.onSubmittedWorkDone).toHaveBeenCalledTimes(1);
});
it("polls a genuine WebGL sync boundary and always deletes its fence", async () => {
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1,
    ALREADY_SIGNALED: 2,
    CONDITION_SATISFIED: 3,
    WAIT_FAILED: 4,
    fenceSync: vi.fn(() => ({})),
    flush: vi.fn(),
    clientWaitSync: vi.fn().mockReturnValueOnce(0).mockReturnValue(3),
    deleteSync: vi.fn(),
    isContextLost: vi.fn(() => false),
  };
  await settleVideoUpload({ backend: { gl } } as unknown as WebGPURenderer);
  expect(gl.clientWaitSync).toHaveBeenCalledTimes(2);
  expect(gl.deleteSync).toHaveBeenCalledTimes(1);
  gl.clientWaitSync.mockReturnValue(4);
  await expect(settleVideoUpload({ backend: { gl } } as unknown as WebGPURenderer)).rejects.toThrow(
    "failed",
  );
  expect(gl.deleteSync).toHaveBeenCalledTimes(2);
  await expect(settleVideoUpload({ backend: {} } as unknown as WebGPURenderer)).rejects.toThrow(
    "unavailable",
  );
});
