import { stateFromProject } from "@musart/core";
import { projectAt } from "../../history/fixtures";
import type { JournalFrame, JournalAction } from "../../../../src/services/animation/journal/model";
export function frameAt(index = 0): JournalFrame {
  return {
    state: stateFromProject(projectAt(index)),
    descriptions: [],
    assets: [],
    pageId: "page",
    revision: index,
  };
}
export function commitAt(
  epoch: string,
  index: number,
  expectedNext = index - 1,
): Extract<JournalAction, { kind: "commit" }> {
  return {
    kind: "commit",
    operation: { id: `commit-${index}`, epoch, expectedNext, retry: false },
    at: index * 1000,
    elapsed: 1000,
    types: ["updateLayers"],
    eventKind: "commit",
    checkpoint: false,
  };
}
