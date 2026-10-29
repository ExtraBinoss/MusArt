import { expect, test } from "vitest";
import { createLayer, createPage } from "@musart/core";
import { canvasHit } from "../../../src/canvas/selection/hit";

test("pointer feedback can target a locked foreground while editing hit tests retain their exclusions", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", { id: "back", x: 0, y: 0, width: 200, height: 200 }),
      createLayer("group", {
        id: "locked-group",
        x: 20,
        y: 20,
        width: 100,
        height: 100,
        locked: true,
      }),
      createLayer("ellipse", {
        id: "child",
        parentId: "locked-group",
        x: 10,
        y: 10,
        width: 40,
        height: 40,
      }),
      createLayer("rectangle", {
        id: "hidden",
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        visible: false,
        locked: true,
      }),
    ],
  });
  expect(canvasHit(page, { x: 50, y: 50 })).toMatchObject({ layer: { id: "back" }, locked: false });
  expect(canvasHit(page, { x: 50, y: 50 }, true)).toMatchObject({
    layer: { id: "child" },
    locked: true,
  });
  expect(canvasHit(page, { x: 21, y: 21 }, true)).toMatchObject({
    layer: { id: "locked-group" },
    locked: true,
  });
  expect(canvasHit(page, { x: 210, y: 210 }, true)).toBeNull();
});
