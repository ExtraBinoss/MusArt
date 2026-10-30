import { expect, test } from "vitest";
import { blendEyeStyles, eyeShapePath } from "../../../../src/ui/brand/engine/eye-shape";
test("retargets compatible cubic eye outlines continuously", () => {
  const mixed = blendEyeStyles("capsule", "heart", 0.4);
  expect(eyeShapePath(30, 45, mixed, "star8", 0, true)).toBe(
    eyeShapePath(30, 45, "capsule", "heart", 0.4, true),
  );
  const path = eyeShapePath(30, 45, mixed, "star8", 0.5, true);
  expect(path.match(/C/g)).toHaveLength(64);
  expect(path).not.toMatch(/NaN|Infinity/);
});
