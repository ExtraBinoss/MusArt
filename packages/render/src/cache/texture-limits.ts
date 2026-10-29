import type { WebGPURenderer } from "three/webgpu";
const limits = new WeakMap<object, number>();

function checkedLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw new Error("GPU texture dimension limit is unavailable before renderer initialization.");
  return value;
}
/** Query the acquired device/context, not an adapter's potentially higher limit. */
export function gpuTextureLimit(renderer: WebGPURenderer): number {
  // Three exposes these runtime backend fields; r186's declaration omits them.
  const backend = renderer.backend as typeof renderer.backend & {
    device?: { limits?: { maxTextureDimension2D?: number } };
    gl?: WebGL2RenderingContext;
  };
  if (backend.device) {
    const cached = limits.get(backend.device);
    if (cached !== undefined) return cached;
    const limit = checkedLimit(backend.device.limits?.maxTextureDimension2D);
    limits.set(backend.device, limit);
    return limit;
  }
  const context = backend.gl ?? renderer.getContext();
  if (
    context &&
    typeof context === "object" &&
    "getParameter" in context &&
    "MAX_TEXTURE_SIZE" in context
  ) {
    const gl = context as WebGL2RenderingContext;
    const cached = limits.get(gl);
    if (cached !== undefined) return cached;
    if (typeof gl.getParameter === "function") {
      const limit = checkedLimit(gl.getParameter(gl.MAX_TEXTURE_SIZE));
      limits.set(gl, limit);
      return limit;
    }
  }
  return checkedLimit(undefined);
}
/** Reject before Three can replace an invalid allocation with its empty fallback texture. */
export function assertTextureSize(width: number, height: number, limit: number): void {
  checkedLimit(limit);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError("Invalid GPU texture dimensions.");
  if (width > limit || height > limit)
    throw new RangeError(
      `GPU texture ${width}×${height} exceeds the device limit of ${limit}px per side.`,
    );
}
