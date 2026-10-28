import { afterEach, expect, it, vi } from "vitest";
import { createProject, EditorEngine, serializeProject } from "@musart/core";
import { ProjectStore } from "../../../src/services/projects/storage";
import { DeletedProjectError } from "../../../src/services/projects/lifecycle";
import { SelectionClient } from "../../../src/services/selection/selection";
import { createEditorServices } from "../../../src/services/session/editor-services";

const resources: { store: ProjectStore; selection: SelectionClient }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    resource.selection.dispose();
    await resource.store.close();
  }
});
async function fixture() {
  const store = new ProjectStore(crypto.randomUUID()),
    selection = new SelectionClient(),
    project = createProject(),
    engine = new EditorEngine(project);
  resources.push({ store, selection });
  await store.save(project);
  return {
    store,
    selection,
    project,
    engine,
    services: createEditorServices(engine, { store, selection }),
  };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

it("rejects saving the active document during the delete/replacement gap without resurrecting it", async () => {
  const d = await fixture(),
    replacement = createProject({ name: "Replacement" }),
    listing = gate(),
    resume = gate();
  await d.store.save(replacement, undefined, { remember: false });
  const actualList = d.store.list.bind(d.store);
  vi.spyOn(d.store, "list").mockImplementationOnce(async () => {
    listing.release();
    await resume.promise;
    return actualList();
  });
  const deleting = d.services.deleteProject(d.project.id);
  try {
    await listing.promise;
    expect(d.engine.getSnapshot().project.id).toBe(d.project.id);
    await expect(d.services.saveProject()).rejects.toBeInstanceOf(DeletedProjectError);
    expect(await d.store.isDeleted(d.project.id)).toBe(true);
    resume.release();
    await deleting;
    expect(d.engine.getSnapshot().project.id).toBe(replacement.id);
    expect(await d.store.last()).toBe(replacement.id);
    expect((await actualList()).map((project) => project.id)).toEqual([replacement.id]);
  } finally {
    resume.release();
    await deleting;
  }
});

it("recovers an intentionally deleted portable document under a fresh durable UUID", async () => {
  const d = await fixture();
  await d.store.remove(d.project.id);
  await d.services.openPortable(new File([serializeProject(d.project)], "recovered.musart"));
  const recovered = d.engine.getSnapshot().project;
  expect(recovered.id).not.toBe(d.project.id);
  expect(recovered).toEqual({ ...d.project, id: recovered.id });
  expect(await d.store.load(recovered.id)).toEqual(recovered);
  expect(await d.store.last()).toBe(recovered.id);
  expect(await d.store.isDeleted(d.project.id)).toBe(true);
  await expect(d.store.load(d.project.id)).rejects.toThrow("introuvable");
});

it("remaps an identity retired after the portable import's initial check", async () => {
  const d = await fixture(),
    portable = createProject({ name: "Late retirement" });
  const actualRead = d.store.isDeleted.bind(d.store);
  vi.spyOn(d.store, "isDeleted").mockImplementationOnce(async (id) => {
    const result = await actualRead(id);
    await d.store.remove(id);
    return result;
  });
  await d.services.openPortable(new File([serializeProject(portable)], "racing.musart"));
  const recovered = d.engine.getSnapshot().project;
  expect(recovered).toEqual({ ...portable, id: recovered.id });
  expect(recovered.id).not.toBe(portable.id);
  expect(await d.store.load(recovered.id)).toEqual(recovered);
  await expect(d.store.load(portable.id)).rejects.toThrow("introuvable");
});

it("reports a failed recreated import and preserves the current session", async () => {
  const d = await fixture(),
    portable = createProject();
  await d.store.remove(portable.id);
  const original = d.engine.getSnapshot();
  vi.spyOn(d.store, "save").mockRejectedValueOnce(new Error("Quota reached"));
  await expect(
    d.services.openPortable(new File([serializeProject(portable)], "failed.musart")),
  ).rejects.toThrow("Quota reached");
  expect(d.engine.getSnapshot()).toBe(original);
  expect((await d.store.list()).map((project) => project.id)).toEqual([d.project.id]);
});

it("waits for pending autosave before a manual save and captures the latest state of the same project", async () => {
  const d = await fixture(),
    pending = gate(),
    started = gate();
  const save = vi.spyOn(d.store, "saveCurrent");
  const services = createEditorServices(d.engine, {
    store: d.store,
    selection: d.selection,
    flush: async () => {
      started.release();
      await pending.promise;
    },
  });
  const operation = services.saveProject();
  await started.promise;
  expect(save).not.toHaveBeenCalled();
  d.engine.execute({ type: "renameProject", name: "Latest edit" });
  pending.release();
  await operation;
  expect(save).toHaveBeenCalledOnce();
  expect((await d.store.load(d.project.id)).name).toBe("Latest edit");
});

it("rejects a manual save when its project changes during the autosave barrier", async () => {
  const d = await fixture(),
    pending = gate(),
    save = vi.spyOn(d.store, "saveCurrent");
  const services = createEditorServices(d.engine, {
    store: d.store,
    selection: d.selection,
    flush: () => pending.promise,
  });
  const operation = services.saveProject(),
    rejected = expect(operation).rejects.toMatchObject({ code: "STALE_PROJECT_WRITE" });
  d.engine.load(createProject());
  pending.release();
  await rejected;
  expect(save).not.toHaveBeenCalled();
});

it("opens a validated project and remembers it without rewriting or rehashing its document", async () => {
  const d = await fixture(),
    other = createProject({ name: "Other" });
  await d.store.save(other);
  const save = vi.spyOn(d.store, "saveCurrent"),
    digest = vi.spyOn(crypto.subtle, "digest");
  await d.services.openProject(d.project.id);
  expect(d.engine.getSnapshot().project.id).toBe(d.project.id);
  expect(await d.store.last()).toBe(d.project.id);
  expect(save).not.toHaveBeenCalled();
  expect(digest).not.toHaveBeenCalled();
});
