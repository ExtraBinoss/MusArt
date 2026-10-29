import { expect, it } from "vitest";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import { artboardFooterPosition } from "../../../src/canvas/artboards/footer-layout";

it("anchors the mode below its artboard while retaining screen-space controls", () => {
  const workspace = arrangeArtboards([{ id: "one", name: "One", width: 200, height: 100 }]);
  expect(artboardFooterPosition(workspace.boards[0]!, workspace, { x: 10, y: 20, zoom: 2 })).toBe(
    "translate3d(10px, 132px, 0) translateX(-50%)",
  );
  expect(
    artboardFooterPosition(workspace.boards[0]!, workspace, { x: 10, y: 20, zoom: 0.01 }),
  ).toBe("translate3d(10px, 32.5px, 0) translateX(-50%)");
});
