import { expect, expectTypeOf, it } from "vitest";
import type { Node, Texture, TextureNode } from "three/webgpu";
import {
  sampleEffect,
  type EffectNodeBuilder,
  type EffectNodeContext,
} from "../../../src/effects/shared/context";
import { uv } from "three/tsl";
import { graphNodes, nodeFixture } from "../node-fixture";
it("exposes a GPU-only node-builder contract", () => {
  expectTypeOf<EffectNodeContext["source"]>().toEqualTypeOf<TextureNode<"vec4">>();
  expectTypeOf<EffectNodeContext["getGlyphAtlas"]>().returns.toEqualTypeOf<Texture>();
  expectTypeOf<EffectNodeBuilder>().parameter(0).toEqualTypeOf<EffectNodeContext>();
  expectTypeOf<EffectNodeBuilder>().returns.toEqualTypeOf<Node<"vec4">>();
});

it("keeps framebuffer orientation in a stable sampling uniform", () => {
  const fixture = nodeFixture("brightness");
  const coordinate = uv();
  const sampled = sampleEffect(fixture.source, fixture.controls, coordinate);
  expect(sampled.value).toBe(fixture.input);
  expect(sampled.uvNode).not.toBeNull();
  const graph = graphNodes(sampled.uvNode!);
  expect(graph.has(coordinate)).toBe(true);
  expect(graph.has(fixture.controls.sourceFlipY)).toBe(true);
  const cacheKey = sampled.getCacheKey();
  fixture.controls.sourceFlipY.value = 1;
  expect(sampled.getCacheKey()).toBe(cacheKey);
  fixture.dispose();
});
