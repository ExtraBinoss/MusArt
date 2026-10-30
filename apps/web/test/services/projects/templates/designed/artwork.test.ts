import { expect, it } from "vitest";
import {
  compileMotion,
  evaluateMotion,
  parseProject,
  serializeProject,
  EditorEngine,
} from "@musart/core";
import {
  createOrbitStudy,
  createPaperMotion,
  createColorfield,
} from "../../../../../src/services/projects/templates/designed/artwork";

it.each([createOrbitStudy, createPaperMotion, createColorfield])(
  "replays %s through real commands with no media, UI or GPU",
  (build) => {
    const result = build(),
      replay = new EditorEngine(result.initial, { now: () => result.project.updatedAt });
    for (const batch of result.batches) replay.transaction([...batch]);
    expect(replay.getSnapshot().project).toEqual(result.project);
    expect(parseProject(serializeProject(result.project))).toEqual(result.project);
    expect(build().project).toEqual(result.project);
    expect(Object.keys(result.project.assets)).toHaveLength(0);
    expect(result.project.pages[0]!.layers.length).toBeGreaterThan(5);
    const program = compileMotion(result.project, { compositionId: result.project.pages[0]!.id });
    const late = evaluateMotion(program, { value: 3, rate: 1 });
    const early = evaluateMotion(program, { value: 1, rate: 1 });
    expect(evaluateMotion(program, { value: 3, rate: 1 })).toEqual(late);
    if (program.mode === "motion") expect(early.values.length).toBeGreaterThan(0);
    else expect(early.values).toHaveLength(0);
  },
);

it("keeps the paper collage grouped and the colorfield design static with an editable gradient", () => {
  const paper = createPaperMotion().project.pages[0]!;
  expect(paper.layers.filter(({ parentId }) => parentId === "paper-collage")).toHaveLength(4);
  expect(
    paper.motion!.tracks.some(({ properties }) =>
      properties.some(
        ({ target }) => target.kind === "effectSetting" && target.property === "progress",
      ),
    ),
  ).toBe(true);
  const still = createColorfield().project.pages[0]!;
  expect(still.motion).toBeUndefined();
  expect(still.layers.some(({ fillGradient }) => !!fillGradient)).toBe(true);
});
