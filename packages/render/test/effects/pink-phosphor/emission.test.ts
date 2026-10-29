import { expect, it } from "vitest";
import { uniform, uv } from "three/tsl";
import { Vector3 } from "three/webgpu";
import {
  phosphorGlow,
  phosphorPalette,
  phosphorTone,
} from "../../../src/effects/pink-phosphor/emission";
import { graphNodes, nodeFixture } from "../node-fixture";

it("builds a shared three-color tone graph without dropping its gamma/exposure or palette uniforms", () => {
  const fixture = nodeFixture("pink-phosphor"),
    rgb = uniform(new Vector3(0.2, 0.5, 0.7)),
    tone = phosphorTone(rgb, fixture.controls),
    color = phosphorPalette(tone, fixture.controls),
    nodes = graphNodes(color),
    key = color.getCacheKey();
  expect(nodes.has(rgb)).toBe(true);
  for (const key of ["exposure", "contrast", "gamma"])
    expect(nodes.has(fixture.controls.parameters[key]!)).toBe(true);
  for (const key of ["background", "phosphor", "highlight"])
    expect(nodes.has(fixture.controls.colors[key]!)).toBe(true);
  rgb.value.set(0.9, 0.5, 0.1);
  expect(color.getCacheKey()).toBe(key);
  fixture.dispose();
});
it("creates bounded source-only glow without allocating an atlas or altering the source", () => {
  const fixture = nodeFixture("pink-phosphor"),
    glow = phosphorGlow(uv(), fixture),
    key = glow.getCacheKey();
  expect(glow.isNode).toBe(true);
  expect(glow.getCacheKey()).toBe(key);
  expect(fixture.getGlyphAtlas).not.toHaveBeenCalled();
  fixture.dispose();
});
