import { expect, test } from "vitest";
import { EditorEngine, createLayer, createPage, createProject } from "@musart/core";
import { assertExportScope, ExportScopeError } from "../../../src/services/session/export-scope";
test("accepts the exact request and rejects changed revisions, pages and selections", () => {
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
  const scope = {
    page: before.project.pages[0]!,
    revision: before.revision,
    selection: before.selection,
  };
  expect(() => assertExportScope(before)).not.toThrow();
  expect(() => assertExportScope(before, scope)).not.toThrow();
  engine.select(["b"]);
  expect(() => assertExportScope(engine.getSnapshot(), scope)).toThrow(ExportScopeError);
  engine.select([]);
  expect(() => assertExportScope(engine.getSnapshot(), scope)).toThrow(ExportScopeError);
  expect(() => assertExportScope({ ...before, revision: before.revision + 1 }, scope)).toThrow(
    ExportScopeError,
  );
  engine.load(before.project);
  expect(() =>
    assertExportScope(
      { ...engine.getSnapshot(), revision: scope.revision, selection: scope.selection },
      scope,
    ),
  ).toThrow(ExportScopeError);
});
