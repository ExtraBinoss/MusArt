import { expect, it } from "vitest";
import * as Three from "three";
import * as FiberThree from "../../../src/canvas/render/fiber-three";
import { FiberTimerClock } from "../../../src/canvas/render/fiber-timer";
it("overrides only the R3F Clock constructor and preserves actual Three object identities", () => {
  expect(FiberThree.Clock).toBe(FiberTimerClock);
  expect(FiberThree.Clock).not.toBe(Three.Clock);
  expect(FiberThree.Mesh).toBe(Three.Mesh);
  expect(FiberThree.Vector3).toBe(Three.Vector3);
  expect(FiberThree.Timer).toBe(Three.Timer);
  const mesh = new FiberThree.Mesh();
  expect(mesh).toBeInstanceOf(Three.Mesh);
  mesh.geometry.dispose();
  (mesh.material as Three.Material).dispose();
});
