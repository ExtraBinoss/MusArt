import { expect, vi } from "vitest";
import { createEffect, type EffectType } from "@musart/core";
import {
  JoinNode,
  SplitNode,
  Texture,
  TextureNode,
  VarNode,
  NodeBuilder,
  type Node,
} from "three/webgpu";
import { texture } from "three/tsl";
import { createEffectUniforms } from "../../src/effects/shared/uniforms";

export function nodeFixture(type: EffectType) {
  const input = new Texture();
  const atlas = new Texture();
  const controls = createEffectUniforms(createEffect(type), 1920, 1080);
  const source = texture(input);
  const getGlyphAtlas = vi.fn(() => atlas);
  return {
    input,
    atlas,
    controls,
    source,
    backdrop: source,
    getGlyphAtlas,
    dispose: () => {
      input.dispose();
      atlas.dispose();
    },
  };
}
class GraphBuilder extends NodeBuilder {}
export function graphNodes(node: Node): Set<Node> {
  const builder = new GraphBuilder();
  const nodes = new Set<Node>();
  const pending = [node];
  while (pending.length) {
    const current = pending.pop()!;
    if (nodes.has(current)) continue;
    nodes.add(current);
    pending.push(...current.getChildren());
    const call = current as Node & {
      isShaderCallNodeInternal?: boolean;
      getOutputNode?: (builder: NodeBuilder) => Node;
    };
    if (call.isShaderCallNodeInternal && call.getOutputNode)
      pending.push(call.getOutputNode(builder));
  }
  return nodes;
}
/** The last component must be the original per-pixel alpha, not a block sample. */
export function expectSourceAlpha(node: Node, input: Texture): void {
  const output = node instanceof VarNode ? node.node : node;
  expect(output).toBeInstanceOf(JoinNode);
  if (!(output instanceof JoinNode)) throw new Error("RGBA output expected");
  const alpha = output.nodes[1];
  expect(alpha).toBeInstanceOf(SplitNode);
  if (!(alpha instanceof SplitNode)) throw new Error("Original alpha component expected");
  expect(alpha.components).toBe("w");
  expect(alpha.node).toBeInstanceOf(TextureNode);
  if (!(alpha.node instanceof TextureNode)) throw new Error("Source texture alpha expected");
  expect(alpha.node.value).toBe(input);
}
