import { afterEach, expect, test } from "vitest";
import { openStudioDatabase } from "../../../../src/services/projects/database";
import { ProjectPreferencesStore } from "../../../../src/services/projects/preferences/store";
import { projectPreferencesKey } from "../../../../src/services/projects/preferences/schema";
import { retireProject } from "../../../../src/services/projects/lifecycle";

const connections: Awaited<ReturnType<typeof openStudioDatabase>>[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
});
async function fixture() {
  const db = await openStudioDatabase(crypto.randomUUID());
  connections.push(db);
  return { db, store: new ProjectPreferencesStore(() => Promise.resolve(db)) };
}

test("restores per-project values and atomically merges concurrent independent fields", async () => {
  const { db, store } = await fixture();
  expect(await store.read("first")).toEqual({});
  await Promise.all([
    store.update("first", { timelineZoom: 260 }),
    store.update("first", { sidebarLayout: { properties: 55, layers: 45 } }),
  ]);
  const reopened = new ProjectPreferencesStore(() => Promise.resolve(db));
  expect(await reopened.read("first")).toEqual({
    timelineZoom: 260,
    sidebarLayout: { properties: 55, layers: 45 },
  });
  expect(await reopened.read("second")).toEqual({});
  expect(await db.count("projects")).toBe(0);
  expect(await db.count("assets")).toBe(0);
  expect(await db.count("journalEvents")).toBe(0);
});

test("retirement rejects queued writes and cannot recreate the removed preference", async () => {
  const { db, store } = await fixture();
  await store.update("retired", { timelineZoom: 320 });
  const tx = db.transaction("preferences", "readwrite");
  await retireProject(tx.store, "retired");
  await tx.store.delete(projectPreferencesKey("retired"));
  await tx.done;
  await expect(store.update("retired", { timelineZoom: 200 })).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
    cause: { code: "PROJECT_DELETED" },
  });
  await expect(store.read("retired")).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_LOAD_FAILED",
  });
  expect(await db.get("preferences", projectPreferencesKey("retired"))).toBeUndefined();
});

test("reports real corruption, invalid values and unavailable storage without replacing saved data", async () => {
  const { db, store } = await fixture();
  await db.put("preferences", "corrupt", projectPreferencesKey("broken"));
  await expect(store.read("broken")).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_LOAD_FAILED",
    cause: expect.any(SyntaxError),
  });
  await expect(store.update("broken", { timelineZoom: 300 })).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
  });
  expect(await db.get("preferences", projectPreferencesKey("broken"))).toBe("corrupt");
  await expect(store.update("other", { timelineZoom: Infinity })).rejects.toMatchObject({
    code: "PROJECT_PREFERENCES_SAVE_FAILED",
  });
  const failure = new Error("storage denied");
  const unavailable = new ProjectPreferencesStore(() => Promise.reject(failure));
  await expect(unavailable.read("first")).rejects.toMatchObject({ cause: failure });
  await expect(unavailable.update("first", { timelineHeight: 0.3 })).rejects.toMatchObject({
    cause: failure,
  });
});
