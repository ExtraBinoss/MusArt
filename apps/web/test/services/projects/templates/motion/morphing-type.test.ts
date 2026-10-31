import { expect, test } from "vitest";
import {
  EditorEngine,
  parseProject,
  serializeProject,
  validateShapeMorph,
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
} from "@musart/core";
import { createMorphingType } from "../../../../../src/services/projects/templates/motion/morphing-type";
import { brand } from "../../../../../src/ui/brand/config";
test("authors the genuine Melt mascot with closed morph states, editable text and deterministic replay", () => {
  const built = createMorphingType(),
    replay = new EditorEngine(built.initial, { now: () => built.initial.createdAt });
  for (const batch of built.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(built.project);
  const page = built.project.pages[0]!,
    body = page.layers.find((l) => l.id === "melt-mascot-body")!;
  expect(page.background).toBe("#ffffff");
  expect(body.kind).toBe("vector");
  expect(body.fill).toBe(brand.colors.primary);
  expect(page.layers.find((l) => l.kind === "text")?.text).toBe("Melt");
  expect(JSON.stringify(built.project)).not.toContain("MORPH");
  const definition = body.effects[0]!.shapeMorph!;
  validateShapeMorph(definition);
  for (const shape of definition.shapes)
    expect(shape.frames.at(-1)!.contours).toEqual(shape.frames[0]!.contours);
  const program = compileMotion(built.project, { compositionId: page.id });
  const end = applyMotionFrame(
    program,
    evaluateMotion(program, page.motion!.duration, { terminalPreview: true }),
  );
  expect(end.layers.find((l) => l.id === body.id)!.effects[0]!.settings?.progress).toBe(1);
  expect(page.motion!.tracks.flatMap((t) => t.animations ?? [])).toHaveLength(1);
  expect(parseProject(serializeProject(built.project))).toEqual(built.project);
});
