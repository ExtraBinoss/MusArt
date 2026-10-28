import { expect, it } from "vitest";
import { createLayer, createPage, createProject, stateFromProject } from "@musart/core";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import {
  projectForJournal,
  snapshotJournalFrame,
} from "../../../../src/services/animation/journal/worker-frame";
import { frameAt } from "./fixtures";
it("owns immutable detached metadata and rejects nested originals or incomplete descriptions", () => {
  const frame = frameAt(),
    snapshot = snapshotJournalFrame(frame);
  frame.state.pages[0]!.layers[0]!.x = 55;
  expect(snapshot.state.pages[0]!.layers[0]!.x).toBe(0);
  expect(Object.isFrozen(snapshot.state.pages[0]!.layers[0])).toBe(true);
  for (const patch of [
    { pageId: "missing" },
    { revision: -1 },
    { state: { ...frame.state, assets: {} } },
    { state: { ...frame.state, replay: {} } },
    { descriptions: [{ id: "unknown" }] },
    { assets: [{ id: "missing" }] },
  ])
    expect(() => snapshotJournalFrame({ ...frame, ...patch } as typeof frame)).toThrow("journal");
});
it("resolves actual originals from incoming, journal and manifest stores, never placeholders", async () => {
  const db = await openStudioDatabase(crypto.randomUUID()),
    asset = {
      id: "original",
      name: "Real",
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl: "data:image/png;base64,AAAA",
    };
  const project = createProject({
    assets: { original: asset },
    pages: [createPage({ layers: [createLayer("image", { assetId: asset.id })] })],
  });
  const { dataUrl: _data, ...description } = asset,
    frame = {
      state: stateFromProject(project),
      descriptions: [description],
      assets: [asset],
      pageId: project.pages[0]!.id,
      revision: 0,
    };
  try {
    expect((await projectForJournal(db, snapshotJournalFrame(frame))).assets.original).toEqual(
      asset,
    );
    frame.assets = [];
    await expect(projectForJournal(db, frame)).rejects.toThrow("missing");
    await db.put("assets", { projectId: project.id, assetId: asset.id, dataUrl: asset.dataUrl });
    expect((await projectForJournal(db, frame)).assets.original!.dataUrl).toBe(asset.dataUrl);
    await db.put("journalAssets", {
      projectId: project.id,
      assetId: asset.id,
      asset: { ...asset, dataUrl: "data:image/png;base64,BBBB" },
    });
    expect((await projectForJournal(db, frame)).assets.original!.dataUrl).toContain("BBBB");
    const corrupted = { ...frame, descriptions: [{ ...description, dataUrl: asset.dataUrl }] };
    expect(() => snapshotJournalFrame(corrupted)).toThrow("metadata");
  } finally {
    db.close();
  }
});
it("validates the exact clone when a source getter changes metadata during capture", () => {
  const frame = frameAt();
  frame.state.assetIds = ["photo"];
  const description = {
    name: "Photo",
    mime: "image/png",
    width: 1,
    height: 1,
    get id() {
      Object.defineProperty(frame.state, "assets", {
        value: { poison: "original bytes" },
        enumerable: true,
      });
      return "photo";
    },
  };
  frame.descriptions = [description];
  const captured = snapshotJournalFrame(frame);
  expect(frame.state).toHaveProperty("assets");
  expect(captured.state).not.toHaveProperty("assets");
  expect(captured.descriptions[0]!.id).toBe("photo");
  expect(Object.isFrozen(captured.state)).toBe(true);
});
