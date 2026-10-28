import { expect, it } from "vitest";
import { float, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import { graphNodes } from "./node-fixture";

it("enumerates every unique node in a shared expression graph without revisiting repeated branches", () => {
  const shared = float(0.5).mul(2);
  const output = vec4(shared, shared, shared, 1);
  const expected = new Set<Node>();
  output.traverse((node) => expected.add(node));
  expect(graphNodes(output)).toEqual(expected);
  expect(graphNodes(shared)).toContain(shared);
});
