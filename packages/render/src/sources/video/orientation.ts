import { Matrix3 } from "three/webgpu";

/** Inverse source UV mapping; source rotation is clockwise, then horizontal flip. */
export function videoOrientationMatrix(rotation: number, flip: boolean): Matrix3 {
  const a = flip ? -1 : 1,
    b = flip ? 1 : 0;
  switch (rotation) {
    case 0:
      return new Matrix3().set(a, 0, b, 0, 1, 0, 0, 0, 1);
    case 90:
      return new Matrix3().set(0, -1, 1, a, 0, b, 0, 0, 1);
    case 180:
      return new Matrix3().set(-a, 0, 1 - b, 0, -1, 1, 0, 0, 1);
    case 270:
      return new Matrix3().set(0, 1, 0, -a, 0, 1 - b, 0, 0, 1);
    default:
      throw RangeError("Unsupported video source rotation.");
  }
}
