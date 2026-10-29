import { expect, test } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  resolveInspectorPage,
  sameInspectorPage,
} from "../../../src/components/properties/inspector-scope";

function fixture() {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle")] }), createPage()] }),
  );
  return { engine, page: engine.getSnapshot().project.pages[0]! };
}

test("only published ruler metadata retains an unchanged Inspector scope and resolves canonically", () => {
  const { engine, page } = fixture();
  expect(sameInspectorPage(page, page)).toBe(true);
  engine.execute({ type: "updatePage", patch: { rulers: true } });
  const current = engine.getSnapshot().project.pages[0]!;
  expect(current).not.toBe(page);
  expect(sameInspectorPage(page, current)).toBe(true);
  expect(resolveInspectorPage(engine, page)).toBe(current);
  expect(sameInspectorPage(page, { ...current })).toBe(false);
  expect(sameInspectorPage({ ...page }, current)).toBe(false);
});

test.each(["name", "width", "guide", "layer", "load", "page"] as const)(
  "rejects a retained Inspector scope after a genuine %s change",
  (change) => {
    const { engine, page } = fixture();
    if (change === "name") engine.execute({ type: "updatePage", patch: { name: "Renamed" } });
    else if (change === "width") engine.execute({ type: "updatePage", patch: { width: 500 } });
    else if (change === "guide")
      engine.execute({ type: "addGuide", guide: { id: "new", axis: "x", position: 10 } });
    else if (change === "layer")
      engine.execute({ type: "updateLayers", ids: [page.layers[0]!.id], patch: { x: 40 } });
    else if (change === "load") engine.load(structuredClone(engine.getSnapshot().project));
    else engine.setPage(engine.getSnapshot().project.pages[1]!.id);
    expect(resolveInspectorPage(engine, page)).toBeNull();
  },
);
