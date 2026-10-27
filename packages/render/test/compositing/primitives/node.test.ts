import { expect, it } from "vitest";
import { AttributeNode } from "three/webgpu";
import { primitiveNode } from "../../../src/compositing/primitives/node";
it("uses instance-rate shape/paint attributes with the same reusable GPU SDF as isolated shapes", () => {
  const graph = primitiveNode(),
    attributes = new Set<string>();
  graph.traverse((node) => {
    if (node instanceof AttributeNode) attributes.add(node.getAttributeName(undefined as never));
  });
  expect([...attributes].sort()).toEqual([
    "primitiveFill",
    "primitiveKindOpacity",
    "primitiveShape",
    "primitiveStroke",
    "uv",
  ]);
});
