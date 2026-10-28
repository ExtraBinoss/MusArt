import { expect, it, vi } from "vitest";
import { createProject, stateFromProject } from "@musart/core";
import { openStudioDatabase } from "../../../src/services/projects/database";
import { ProjectStore } from "../../../src/services/projects/storage";
import {
  DeletedProjectError,
  assertProjectWritable,
  isProjectDeleted,
  retireProject,
} from "../../../src/services/projects/lifecycle";
import * as revisions from "../../../src/services/projects/thumbnails/revision";
import * as fingerprints from "../../../src/services/history/fingerprint";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const payloadStores = [
  "projects",
  "assets",
  "thumbnails",
  "journalMeta",
  "journalBase",
  "journalEvents",
  "journalAssets",
] as const;

it("retires only the exact identity and reports a typed error using native preferences", async () => {
  const db = await openStudioDatabase(crypto.randomUUID());
  try {
    const tx = db.transaction("preferences", "readwrite");
    await assertProjectWritable(tx.store, "__proto__");
    expect(await isProjectDeleted(tx.store, "__proto__")).toBe(false);
    await retireProject(tx.store, "__proto__");
    await tx.done;
    const read = db.transaction("preferences");
    expect(await isProjectDeleted(read.store, "__proto__")).toBe(true);
    expect(await isProjectDeleted(read.store, "other")).toBe(false);
    await expect(assertProjectWritable(read.store, "__proto__")).rejects.toMatchObject({
      name: "DeletedProjectError",
      code: "PROJECT_DELETED",
      projectId: "__proto__",
    });
    await read.done;
    expect(await db.count("preferences")).toBe(1);
  } finally {
    db.close();
  }
});

it("rejects a save started before another session deletes while its hashing is still pending", async () => {
  const name = crypto.randomUUID(),
    first = new ProjectStore(name),
    second = new ProjectStore(name),
    project = createProject(),
    started = gate(),
    resume = gate();
  await first.save(project);
  await first.history.ensure(project, project.pages[0]!.id);
  const actual = revisions.thumbnailRevision;
  vi.spyOn(revisions, "thumbnailRevision").mockImplementationOnce(async (...args) => {
    started.release();
    await resume.promise;
    return actual(...args);
  });
  const pending = first.save({ ...project, name: "Late save" });
  const rejection = expect(pending).rejects.toBeInstanceOf(DeletedProjectError);
  const db = await openStudioDatabase(name);
  try {
    await started.promise;
    await second.remove(project.id);
    resume.release();
    await rejection;
    for (const table of payloadStores) expect(await db.count(table)).toBe(0);
    expect(await first.last()).toBeUndefined();
    expect(await first.isDeleted(project.id)).toBe(true);
    await first.close();
    const reopened = new ProjectStore(name);
    try {
      await expect(reopened.save(project)).rejects.toBeInstanceOf(DeletedProjectError);
      expect(await reopened.list()).toEqual([]);
    } finally {
      await reopened.close();
    }
  } finally {
    resume.release();
    db.close();
    await first.close();
    await second.close();
  }
});

it("rejects delayed history initialization and clear from separate sessions without orphan records", async () => {
  const name = crypto.randomUUID(),
    first = new ProjectStore(name),
    second = new ProjectStore(name),
    project = createProject(),
    resume = gate(),
    initialized = gate(),
    clearing = gate();
  await first.save(project);
  await first.history.ensure(project, project.pages[0]!.id);
  const fingerprint = await fingerprints.fingerprintState(stateFromProject(project));
  vi.spyOn(fingerprints, "fingerprintState")
    .mockImplementationOnce(async () => {
      initialized.release();
      await resume.promise;
      return fingerprint;
    })
    .mockImplementationOnce(async () => {
      clearing.release();
      await resume.promise;
      return fingerprint;
    });
  const ensure = first.history.ensure(project, project.pages[0]!.id),
    clear = second.history.clear(project, project.pages[0]!.id);
  const ensureRejected = expect(ensure).rejects.toBeInstanceOf(DeletedProjectError),
    clearRejected = expect(clear).rejects.toBeInstanceOf(DeletedProjectError);
  const db = await openStudioDatabase(name);
  try {
    await Promise.all([initialized.promise, clearing.promise]);
    await second.remove(project.id);
    resume.release();
    await Promise.all([ensureRejected, clearRejected]);
    await expect(first.history.configure(project.id, { enabled: true })).rejects.toBeInstanceOf(
      DeletedProjectError,
    );
    await expect(
      first.history.append(
        project.id,
        {
          projectId: project.id,
          pageId: project.pages[0]!.id,
          at: 1,
          kind: "commit",
          commands: [],
          delta: [],
        },
        {},
        project.updatedAt,
      ),
    ).rejects.toBeInstanceOf(DeletedProjectError);
    for (const table of payloadStores) expect(await db.count(table)).toBe(0);
  } finally {
    resume.release();
    db.close();
    await first.close();
    await second.close();
  }
});

it("rolls back the retirement marker with a failed cascade and permits a genuine retry", async () => {
  const name = crypto.randomUUID(),
    store = new ProjectStore(name),
    project = createProject();
  await store.save(project);
  const nativeDelete = IDBObjectStore.prototype.delete;
  const failure = vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore["delete"]>
  ) {
    if (this.name === "projects") throw new Error("Cascade failed");
    return nativeDelete.apply(this, args);
  });
  try {
    await expect(store.remove(project.id)).rejects.toThrow("Cascade failed");
    failure.mockRestore();
    expect(await store.isDeleted(project.id)).toBe(false);
    await store.save({ ...project, name: "Survived" });
    expect((await store.load(project.id)).name).toBe("Survived");
    await store.remove(project.id);
    await expect(store.save(project)).rejects.toBeInstanceOf(DeletedProjectError);
  } finally {
    failure.mockRestore();
    await store.close();
  }
});
