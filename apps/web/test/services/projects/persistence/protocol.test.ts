import { expect, it } from "vitest";
import {
  persistenceResponse,
  persistenceFailure,
  PersistenceUncertainError,
  persistenceResult,
} from "../../../../src/services/projects/persistence/protocol";
import { StaleProjectWriteError } from "../../../../src/services/projects/writes/revision";
it("validates an explicit historical-read marker without accepting arbitrary stale status", () => {
  const value = {
    projectId: "p",
    pageId: "a",
    revision: "old",
    width: 1,
    height: 1,
    updatedAt: "date",
    blob: new Blob(["pixels"]),
    stale: true,
  };
  expect(persistenceResult({ kind: "thumbnails", value: [value] })).toMatchObject({
    value: [{ stale: true }],
  });
  expect(() =>
    persistenceResult({ kind: "thumbnails", value: [{ ...value, stale: "yes" }] }),
  ).toThrow("Malformed");
});
it("accepts only coherent small acknowledgments and preserves real domain failures", () => {
  const ack = {
    id: 1,
    result: {
      kind: "save",
      value: { projectId: "project", assetsRevision: "assets:1", writeRevision: "opaque-write" },
    },
  };
  expect(persistenceResponse(ack, 1)).toBe(ack);
  expect(
    persistenceResponse({ id: 1, result: { kind: "thumbnail", value: false } }, 1),
  ).toHaveProperty("result.value", false);
  for (const value of [
    null,
    { ...ack, id: 2 },
    { ...ack, result: { kind: "save", value: { ...ack.result.value, writeRevision: "" } } },
    { id: 1, result: { kind: "thumbnail", value: "true" } },
  ])
    expect(() => persistenceResponse(value, 1)).toThrow();
  expect(
    persistenceFailure({ name: "Error", message: "stale", code: "STALE_PROJECT_WRITE" }, "project"),
  ).toBeInstanceOf(StaleProjectWriteError);
  for (const code of ["PROJECT_DELETED", "ASSET_BASIS_MISMATCH", "other"])
    expect(
      persistenceFailure({ name: "Error", message: "failure", code }, "project"),
    ).toHaveProperty("code", code);
  expect(
    persistenceFailure({ name: "QuotaExceededError", message: "quota" }, "project"),
  ).toMatchObject({ name: "QuotaExceededError", message: "quota" });
  expect(new PersistenceUncertainError()).toHaveProperty("code", "UNCERTAIN_PROJECT_WRITE");
});
