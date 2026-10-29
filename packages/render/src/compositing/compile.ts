import type { Camera, RenderTarget, Scene, WebGPURenderer } from "three/webgpu";

/** Compile on the initialized renderer's real attachment format. Three yields while building nodes.
 * Restore the public render target BEFORE awaiting, so the demand-driven display can still render.
 * This prepares the existing objects; it never draws an intermediate or reads GPU pixels.
 */
export async function compileGpuScene(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  target: RenderTarget,
  canContinue?: () => boolean,
): Promise<void> {
  const check = () => {
    if (canContinue && !canContinue())
      throw new DOMException("GPU preparation was superseded.", "AbortError");
  };
  check();
  const previous = renderer.getRenderTarget();
  let pending: Promise<unknown>;
  try {
    renderer.setRenderTarget(target);
    pending = renderer.compileAsync(scene, camera);
  } finally {
    renderer.setRenderTarget(previous);
  }
  await pending;
  check();
}
