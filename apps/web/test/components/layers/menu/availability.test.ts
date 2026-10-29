import { expect, test } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { sameSelectionAvailability } from "../../../../src/components/layers/menu/availability";

test("only visible action gates invalidate same-page selection controls", () => {
  const a = createLayer("rectangle", { id: "a" }),
    b = createLayer("rectangle", { id: "b" });
  const group = createLayer("group", { id: "group" });
  const child = createLayer("rectangle", { id: "child", parentId: group.id });
  const locked = createLayer("rectangle", { id: "locked", locked: true });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [a, b, group, child, locked] })] }),
  );
  const page = engine.getSnapshot().project.pages[0]!,
    run = () => {};
  const props = (selection: string[]) => ({ engine, page, selection, run });
  expect(sameSelectionAvailability(props([a.id]), props([b.id]))).toBe(true);
  expect(sameSelectionAvailability(props([a.id]), props([locked.id]))).toBe(false);
  expect(sameSelectionAvailability(props([a.id]), props([group.id]))).toBe(false);
  expect(sameSelectionAvailability(props([a.id]), props([a.id, b.id]))).toBe(false);
  expect(sameSelectionAvailability(props([a.id, b.id]), props([a.id, child.id]))).toBe(false);
  expect(sameSelectionAvailability(props([a.id]), { ...props([a.id]), run: () => {} })).toBe(false);
  expect(sameSelectionAvailability(props([a.id]), { ...props([a.id]), page: { ...page } })).toBe(
    false,
  );
  expect(
    sameSelectionAvailability(props([a.id]), { ...props([a.id]), engine: new EditorEngine() }),
  ).toBe(false);
});

test("ruler metadata keeps action controls while real layer edits and loads invalidate them", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle")] })] }),
  );
  const page = engine.getSnapshot().project.pages[0]!;
  const before = { engine, page, selection: [page.layers[0]!.id], run: () => {} };
  engine.execute({ type: "updatePage", patch: { rulers: true } });
  const metadata = { ...before, page: engine.getSnapshot().project.pages[0]! };
  expect(sameSelectionAvailability(before, metadata)).toBe(true);
  engine.execute({ type: "updateLayers", ids: before.selection, patch: { locked: true } });
  const edited = { ...metadata, page: engine.getSnapshot().project.pages[0]! };
  expect(sameSelectionAvailability(metadata, edited)).toBe(false);
  engine.load(engine.getSnapshot().project);
  expect(
    sameSelectionAvailability(edited, {
      ...edited,
      page: engine.getSnapshot().project.pages[0]!,
    }),
  ).toBe(false);
});
