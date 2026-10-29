import { expect, it } from "vitest";
import { Vector3 } from "three/webgpu";
import { videoOrientationMatrix } from "../../../src/sources/video/orientation";
it("maps normalized display corners back to original UVs after rotation and flip exactly once", () => {
  const point = (rotation: number, flip: boolean, x: number, y: number) =>
    new Vector3(x, y, 1).applyMatrix3(videoOrientationMatrix(rotation, flip)).toArray().slice(0, 2);
  expect(point(0, false, 0, 1)).toEqual([0, 1]);
  expect(point(90, false, 1, 1)).toEqual([0, 1]);
  expect(point(180, false, 1, 0)).toEqual([0, 1]);
  expect(point(270, false, 0, 0)).toEqual([0, 1]);
  expect(point(90, true, 0, 1)).toEqual([0, 1]);
  expect(point(0, true, 0, 1)).toEqual([1, 1]);
  expect(() => videoOrientationMatrix(45, false)).toThrow();
});
