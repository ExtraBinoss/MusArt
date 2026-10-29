import { expect, it, vi } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
import { createMediaProjectOpener } from "../../../src/services/session/media-project";
function setup() {
  const engine = new EditorEngine(),
    project = createProject({ name: "Imported" });
  const store = {
    list: vi.fn(async () => []),
    isDeleted: vi.fn(async () => false),
    prepareSave: vi.fn(async () => ({ project })),
    persistPrepared: vi.fn(async () => {}),
  };
  const open = createMediaProjectOpener(engine, { store });
  return { engine, project, store, open };
}
it("loads only after durable acknowledgement and locks concurrent document mutations", async () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  d.store.persistPrepared.mockImplementation(async () => {
    expect(d.engine.getSnapshot()).toBe(before);
    expect(() => d.engine.execute({ type: "renameProject", name: "Race" })).toThrow("busy");
    expect(() => d.engine.load(createProject())).toThrow("busy");
  });
  await d.open(d.project, []);
  expect(d.engine.getSnapshot().project).toEqual(d.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
it("cancels/stales preparation without publication or lock leakage", async () => {
  const d = setup(),
    abort = new AbortController(),
    before = d.engine.getSnapshot();
  d.store.prepareSave.mockImplementation(async () => {
    abort.abort();
    return { project: d.project };
  });
  await expect(d.open(d.project, [], { signal: abort.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.store.persistPrepared).not.toHaveBeenCalled();
  d.engine.execute({ type: "renameProject", name: "Editable" });
  const origin = { projectId: before.project.id, pageId: before.pageId, revision: before.revision };
  await expect(d.open(d.project, [], { expectedOrigin: origin })).rejects.toMatchObject({
    name: "AbortError",
  });
});
it("reports real persistence failure and never replaces the active editor", async () => {
  const d = setup(),
    before = d.engine.getSnapshot();
  d.store.persistPrepared.mockRejectedValue(Error("Uncertain acknowledgement"));
  await expect(d.open(d.project, [])).rejects.toThrow("Uncertain");
  expect(d.engine.getSnapshot()).toBe(before);
  d.engine.execute({ type: "renameProject", name: "Still editable" });
});
