import { expect, it } from "vitest";
import {
  StaleProjectWriteError,
  readProjectWriteRevision,
  assertProjectWriteRevision,
  renewProjectWriteRevision,
} from "../../../../src/services/projects/writes/revision";
import { DeletedProjectError } from "../../../../src/services/projects/lifecycle";
it("uses collision-free durable keys, renews opaque revisions and reports stale/deleted identities", async () => {
  const values = new Map<string, string>(),
    preferences = {
      get: async (key: string) => values.get(key),
      put: async (value: string, key: string) => {
        values.set(key, value);
        return key;
      },
    };
  expect(await readProjectWriteRevision(preferences, "a")).toBe("");
  await assertProjectWriteRevision(preferences, "a", "");
  await renewProjectWriteRevision(preferences, "a");
  const first = await readProjectWriteRevision(preferences, "a");
  expect(first).not.toBe("");
  await assertProjectWriteRevision(preferences, "a", first);
  await renewProjectWriteRevision(preferences, "a");
  await expect(assertProjectWriteRevision(preferences, "a", first)).rejects.toMatchObject({
    name: "StaleProjectWriteError",
    code: "STALE_PROJECT_WRITE",
    projectId: "a",
  });
  expect(new StaleProjectWriteError("a")).toBeInstanceOf(Error);
  await renewProjectWriteRevision(preferences, '["a"]');
  expect(values.size).toBe(2);
  values.set("deleted-project:a", "1");
  await expect(assertProjectWriteRevision(preferences, "a", first)).rejects.toBeInstanceOf(
    DeletedProjectError,
  );
});
