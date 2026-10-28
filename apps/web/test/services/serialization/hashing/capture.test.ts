import { expect, test } from "vitest";
import { createPage, createProject, EditorEngine, stateFromProject } from "@musart/core";
import { captureHashJob } from "../../../../src/services/serialization/hashing/capture";

test("captures mutable external values but shares only certified immutable pages", () => {
  const page = createPage(),
    sources: [string, string][] = [["asset", "digest"]];
  const captured = captureHashJob({ kind: "thumbnail", page, sources });
  expect(captured.kind).toBe("thumbnail");
  if (captured.kind !== "thumbnail") throw new Error("Wrong job");
  expect(captured.page).not.toBe(page);
  page.name = "Later";
  sources[0]![1] = "Later";
  expect(captured.page.name).not.toBe("Later");
  expect(captured.sources).toEqual([["asset", "digest"]]);
  Object.freeze(page);
  const frozen = captureHashJob({ kind: "thumbnail", page, sources });
  expect(frozen.kind === "thumbnail" && frozen.page).not.toBe(page);
  const engine = new EditorEngine(createProject({ pages: [createPage()] }));
  const published = engine.getSnapshot().project.pages[0]!;
  const owned = captureHashJob({ kind: "thumbnail", page: published, sources });
  expect(owned.kind === "thumbnail" && owned.page).toBe(published);
});

test("detaches history state before asynchronous transfer", () => {
  const state = stateFromProject(createProject());
  const captured = captureHashJob({ kind: "history", state });
  state.name = "Changed";
  expect(captured.kind === "history" && captured.state.name).not.toBe("Changed");
});
