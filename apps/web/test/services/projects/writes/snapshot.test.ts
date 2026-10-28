import { expect, it } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { snapshotProject } from "../../../../src/services/projects/writes/snapshot";
it("isolates every mutable paint field before awaits and freezes nested arrays even under shallow-frozen roots", () => {
  const project = createProject({
    pages: [
      createPage({ layers: [createLayer("rectangle", { effects: [createEffect("blur")] })] }),
    ],
  });
  Object.freeze(project);
  const snapshot = snapshotProject(project);
  project.pages[0]!.layers[0]!.effects[0]!.amount = 0.8;
  expect(snapshot.pages[0]!.layers[0]!.effects[0]!.amount).not.toBe(0.8);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.pages[0]!.layers[0]!.effects[0])).toBe(true);
  expect(Object.isFrozen(snapshot.pages)).toBe(true);
  expect(snapshotProject(snapshot)).toBe(snapshot);
  expect(snapshotProject(project)).not.toBe(snapshot);
});
