import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
import { createDocumentSearchItems } from "../../../../src/components/search/catalog/document-items";
test("indexes named pages and front-to-back layers without retaining originals or executable handlers", () => {
  const a = createLayer("rectangle", { name: "First" }),
    b = createLayer("text", { name: "Café", text: "Bonjour" }),
    page = createPage({ layers: [a, b] }),
    project = createProject({ pages: [page] });
  const items = createDocumentSearchItems(project, (key) => key);
  expect(items.map((item) => item.label)).toEqual([page.name, "Café", "First"]);
  expect(items[1]).toMatchObject({
    terms: expect.stringContaining("Bonjour"),
    target: { kind: "layer", pageId: page.id, layerId: b.id },
  });
  expect(items[0]!.detail).toBe(`${page.width} × ${page.height}`);
});
