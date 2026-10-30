import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { isTimelineGestureCurrent } from "../../../../src/components/motion/gestures/origin";

it("owns the exact document, page, revision and installed selection until another authority changes it", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [createLayer("rectangle", { id: "a" }), createLayer("rectangle", { id: "b" })],
        }),
      ],
    }),
  );
  engine.select(["a"]);
  const before = engine.getSnapshot();
  const origin = {
    project: before.project,
    page: { id: before.pageId },
    revision: before.revision,
    installedLayers: before.selection,
  };
  expect(isTimelineGestureCurrent(before, origin)).toBe(true);
  engine.select(["a"]);
  expect(isTimelineGestureCurrent(engine.getSnapshot(), origin)).toBe(true);
  engine.select(["b"]);
  expect(isTimelineGestureCurrent(engine.getSnapshot(), origin)).toBe(false);
  expect(isTimelineGestureCurrent({ ...before, pageId: "another" }, origin)).toBe(false);
  expect(isTimelineGestureCurrent({ ...before, revision: before.revision + 1 }, origin)).toBe(
    false,
  );
  expect(isTimelineGestureCurrent({ ...before, project: { ...before.project } }, origin)).toBe(
    false,
  );
});
