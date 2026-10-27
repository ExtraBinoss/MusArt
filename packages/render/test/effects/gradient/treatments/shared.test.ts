import { expect, it } from "vitest";
import { uniform, uv, vec4 } from "three/tsl";
import {
  mixRGBA,
  premultiply,
  readGradient,
  treatmentControls,
  unpremultiply,
} from "../../../../src/effects/gradient/treatments/shared";
import { nodeFixture } from "../../node-fixture";
it("clamps texture samples and performs interpolation in premultiplied alpha", () => {
  const f = nodeFixture("gradient"),
    a = vec4(0.5, 0.2, 0.8, 0.5),
    b = vec4(0.8, 0.9, 0.1, 0);
  expect(treatmentControls(f)).toBe(f.controls.gradient);
  for (const node of [
    readGradient(f, uv()),
    premultiply(a),
    unpremultiply(a),
    mixRGBA(a, b, uniform(0.5)),
  ])
    expect(node.isNode).toBe(true);
  expect(() => treatmentControls({ ...f, controls: { ...f.controls, gradient: null } })).toThrow(
    "uniforms",
  );
  f.dispose();
});
