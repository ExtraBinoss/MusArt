import {
  createLayer,
  createPage,
  createProject,
  diffReplayState,
  stateFromProject,
  type Project,
  type ReplayEvent,
} from "@musart/core";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { HistoryStore } from "../../../src/services/history/store";

export function projectAt(index = 0): Project {
  return createProject({
    id: "history-project",
    name: "Timeline",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    pages: [
      createPage({
        id: "page",
        width: 600,
        height: 400,
        layers: [
          createLayer("rectangle", { id: "shape", name: "Shape", x: index, width: 80, height: 60 }),
        ],
      }),
    ],
  });
}
export function eventAt(index: number, checkpoint = false): ReplayEvent {
  return {
    projectId: "history-project",
    at: index * 1000,
    pageId: "page",
    kind: "commit",
    commands: [{ type: "updateLayers", ids: ["shape"], patch: { x: index } }],
    delta: diffReplayState(
      stateFromProject(projectAt(index - 1)),
      stateFromProject(projectAt(index)),
    ),
    ...(checkpoint ? { after: stateFromProject(projectAt(index)) } : {}),
  };
}
export async function fixture() {
  const db = await openStudioDatabase(crypto.randomUUID());
  const store = new HistoryStore(async () => db);
  await store.ensure(projectAt(), "page");
  return { db, store };
}
export async function seed(store: HistoryStore, count: number) {
  for (let index = 1; index <= count; index++)
    await store.append(
      "history-project",
      eventAt(index, index % 250 === 0),
      {},
      projectAt(index).updatedAt,
      1000,
      { expectedNext: index - 1, current: stateFromProject(projectAt(index)) },
    );
}
