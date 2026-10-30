import { expect, it, vi } from "vitest";
import { vec4 } from "three/tsl";
import { transitionNode } from "../../../src/effects/transition/node";
import { nodeFixture } from "../node-fixture";
it("defers the selected GPU expression to compilation and keeps graph identity stable for animated progress", () => {
  const f = nodeFixture("transition"),
    operator = vi.fn(() => vec4(1));
  const node = transitionNode(f, operator);
  expect(node.isNode).toBe(true);
  expect(operator).not.toHaveBeenCalled();
  const key = node.getCacheKey();
  f.controls.parameters.progress!.value = 0;
  expect(node.getCacheKey()).toBe(key);
  f.controls.parameters.progress!.value = 1;
  expect(node.getCacheKey()).toBe(key);
  f.dispose();
});
