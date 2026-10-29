import type { WebGPURenderer } from "three/webgpu";

/** Fiber retains the requested density; physical presentation retains exact frame texels. */
export class DrawingDensity {
  readonly bounds: [number, number] = [1, 1];
  private frame: { width: number; height: number } | null = null;
  apply(scale: number, setDpr: (value: number) => void, width: number, height: number): void {
    if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid drawing density.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
      throw new Error("Invalid drawing dimensions.");
    this.frame = { width, height };
    this.bounds[0] = scale;
    this.bounds[1] = scale;
    setDpr(scale);
  }
  /** Before R3F's draw, repair Three's floor-rounded resize without changing CSS or camera. */
  prepare(renderer: Pick<WebGPURenderer, "domElement" | "setDrawingBufferSize">): void {
    const frame = this.frame;
    if (
      frame &&
      (renderer.domElement.width !== frame.width || renderer.domElement.height !== frame.height)
    )
      renderer.setDrawingBufferSize(frame.width, frame.height, 1);
  }
}
