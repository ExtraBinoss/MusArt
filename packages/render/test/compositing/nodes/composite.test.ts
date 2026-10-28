import { expect, it } from "vitest";
import { graphNodes } from "../../effects/node-fixture";
import {
  blendControls,
  blendNode,
  copyControls,
  copyNode,
  maskControls,
  maskNode,
  normalNode,
  sourceControls,
} from "../../../src/compositing/nodes/composite";
it("builds source-over, alpha mask, normalization and W3C blend graphs with mutable uniforms", () => {
  const source = sourceControls();
  const normal = normalNode(source);
  const before = normal.getCacheKey();
  source.opacity.value = 0.5;
  source.premultiplied.value = 1;
  expect(normal.getCacheKey()).toBe(before);
  for (const node of [
    normal,
    copyNode(copyControls()),
    maskNode(maskControls()),
    blendNode(blendControls()),
  ])
    expect(node.isNode).toBe(true);
  const controls = blendControls();
  const blend = blendNode(controls);
  const key = blend.getCacheKey();
  controls.mode.value = 2;
  controls.parentSize.value.set(300, 200);
  expect(blend.getCacheKey()).toBe(key);
  const copy = copyControls();
  const node = copyNode(copy);
  expect(graphNodes(node).has(copy.premultiply)).toBe(true);
  const copyKey = node.getCacheKey();
  copy.premultiply.value = 1;
  expect(node.getCacheKey()).toBe(copyKey);
});
