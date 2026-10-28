/** One mutable adapter-owned DPR tuple, retained by Fiber's resize configuration. */
export class DrawingDensity {
  readonly bounds: [number, number] = [1, 1];
  apply(scale: number, setDpr: (value: number) => void): void {
    if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid drawing density.");
    this.bounds[0] = scale;
    this.bounds[1] = scale;
    setDpr(scale);
  }
}
