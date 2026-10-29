import type { WebGPURenderer } from "three/webgpu";

/** Ownership acknowledgement only: no GPU bytes are mapped or read back into JavaScript. */
export async function settleVideoUpload(renderer: WebGPURenderer): Promise<void> {
  const backend = renderer.backend as unknown as {
    device?: GPUDevice;
    gl?: WebGL2RenderingContext;
  };
  if (backend.device) {
    await backend.device.queue.onSubmittedWorkDone();
    return;
  }
  const gl = backend.gl;
  if (!gl) throw Error("Video upload acknowledgement is unavailable for this renderer.");
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) throw Error("Video upload GPU fence could not be created.");
  gl.flush();
  try {
    for (;;) {
      const status = gl.clientWaitSync(fence, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return;
      if (status === gl.WAIT_FAILED || gl.isContextLost())
        throw Error("Video upload GPU fence failed.");
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    gl.deleteSync(fence);
  }
}
