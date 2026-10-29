import { expect, test } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { sameCanvasGeometry } from "../../../src/canvas/session/geometry-equality";

function snapshot() {
  return new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("rectangle", {
              guides: [{ id: "g", axis: "x", position: 2 }],
              margin: { top: 1, right: 2, bottom: 3, left: 4 },
            }),
          ],
        }),
        createPage(),
      ],
    }),
  ).getSnapshot();
}
test("ignores paint, original identity and equal deeply copied guides/insets", () => {
  const a = snapshot(),
    b = structuredClone(a);
  b.project.pages[0]!.background = "#010203";
  b.project.pages[0]!.layers[0]!.fill = "#020304";
  b.project.pages[0]!.layers[0]!.opacity = 0.2;
  b.project.pages[0]!.rulers = true;
  expect(sameCanvasGeometry(a, a)).toBe(true);
  expect(sameCanvasGeometry(a, b)).toBe(true);
});
test("detects each geometry, metadata and overlay field without serialization", () => {
  const a = snapshot();
  const mutations = [
    (b: typeof a) => {
      b.project.id = "other";
    },
    (b: typeof a) => {
      b.pageId = b.project.pages[1]!.id;
    },
    (b: typeof a) => {
      b.project.pages.pop();
    },
    (b: typeof a) => {
      b.project.pages.reverse();
    },
    (b: typeof a) => {
      b.project.pages[1]!.name = "Other";
    },
    (b: typeof a) => {
      b.project.pages[0]!.margins = { top: 1, right: 1, bottom: 1, left: 1 };
    },
    (b: typeof a) => {
      b.project.pages[0]!.guides.push({ id: "p", axis: "y", position: 3 });
    },
    (b: typeof a) => {
      b.project.pages[0]!.layers.pop();
    },
    (b: typeof a) => {
      b.project.pages[0]!.layers[0]!.x++;
    },
    (b: typeof a) => {
      b.project.pages[0]!.layers[0]!.name = "Renamed";
    },
    (b: typeof a) => {
      b.project.pages[0]!.layers[0]!.maskSource = true;
    },
    (b: typeof a) => {
      b.project.pages[0]!.layers[0]!.margin!.left++;
    },
    (b: typeof a) => {
      b.project.pages[0]!.layers[0]!.padding = { top: 1, right: 1, bottom: 1, left: 1 };
    },
    (b: typeof a) => {
      b.project.pages[0]!.layers[0]!.guides![0]!.position++;
    },
  ];
  for (const mutate of mutations) {
    const b = structuredClone(a);
    mutate(b);
    expect(sameCanvasGeometry(a, b)).toBe(false);
  }
});
