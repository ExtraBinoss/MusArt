import { expect, it } from "vitest";
import { vec2 } from "three/tsl";
import {
  transitionField,
  revealCoverage,
  reveal,
  travelCoverage,
  withCoverage,
} from "../../../src/effects/transition/shared";
import { updateEffectUniforms } from "../../../src/effects/shared/uniforms";
import { createEffect } from "@musart/core";
import { graphNodes, nodeFixture } from "../node-fixture";
it("keeps authored controls, source orientation and clipped coordinates independent of output density", () => {
  const f = nodeFixture("transition"),
    field = transitionField(f);
  const samples = [
    field.read(vec2(-1, 2)),
    field.fromAxes(field.along, field.perpendicular),
    field.fromPhysical(field.physical),
    field.rank(),
    revealCoverage(field, field.rank()),
    reveal(field, field.rank()),
    withCoverage(field.original, field.progress),
    travelCoverage(field),
  ];
  for (const sample of samples) expect(sample.isNode).toBe(true);
  const graph = graphNodes(field.read(field.position));
  expect(graph.has(f.controls.sourceFlipY)).toBe(true);
  expect(graph.has(f.controls.resolution)).toBe(false);
  const progress = f.controls.parameters.progress,
    direction = f.controls.parameters.direction;
  updateEffectUniforms(
    f.controls,
    createEffect("transition", { settings: { progress: 0.3, direction: "down" } }),
    320,
    180,
    { width: 1920, height: 1080 },
  );
  expect(f.controls.parameters.progress).toBe(progress);
  expect(f.controls.parameters.direction).toBe(direction);
  expect(progress!.value).toBe(0.3);
  expect(direction!.value).toBe(3);
  f.dispose();
});
