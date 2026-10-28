import { expect, it } from "vitest";
import { EditorEngine } from "@musart/core";
import { captureJournalFrame } from "../../../../src/services/animation/journal/frame";
import { projectAt } from "../../history/fixtures";

it("keeps originals out of metadata and sends each unchanged source only initially", () => {
  const project = projectAt();
  project.assets.photo = {
    id: "photo",
    name: "Photo",
    mime: "image/png",
    width: 10,
    height: 10,
    dataUrl: "data:image/png;base64,AAAA",
  };
  const engine = new EditorEngine(project),
    snapshot = engine.getSnapshot();
  const initial = captureJournalFrame(snapshot),
    commit = captureJournalFrame(snapshot, snapshot.project.assets);
  expect(initial.assets).toHaveLength(1);
  expect(commit.assets).toHaveLength(0);
  expect(initial.descriptions).toEqual([
    { id: "photo", name: "Photo", mime: "image/png", width: 10, height: 10 },
  ]);
  expect(initial.state).not.toHaveProperty("assets");
  expect(initial.state.pages).toBe(snapshot.project.pages);
  const changed = structuredClone(snapshot);
  changed.project.assets.photo!.dataUrl = "data:image/png;base64,BBBB";
  expect(captureJournalFrame(changed, snapshot.project.assets).assets).toHaveLength(1);
  const frame = captureJournalFrame(changed);
  changed.project.name = "Later";
  expect(frame.state.name).not.toBe("Later");
});
