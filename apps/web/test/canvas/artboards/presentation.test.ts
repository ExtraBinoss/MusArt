import { expect, it } from "vitest";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import { artboardStyle, paintArtboards } from "../../../src/canvas/artboards/presentation";

it("imperatively positions active/inactive frames and unscaled headings from the same world pose", () => {
  const workspace = arrangeArtboards([
      { id: "a", name: "A", width: 200, height: 160 },
      { id: "b", name: "B", width: 300, height: 100 },
    ]),
    view = { x: 10, y: 20, zoom: 2 },
    root = document.createElement("div");
  root.innerHTML =
    '<div data-artboard-id="a"></div><div data-artboard-id="b"></div><div data-artboard-id="a" class="artboard-heading"></div><div data-artboard-id="gone"></div>';
  paintArtboards(root, workspace, view);
  expect(root.children[0]).toHaveStyle({
    width: "200px",
    height: "160px",
    marginLeft: "-100px",
    marginTop: "-80px",
    transform: "translate3d(-418px, 20px, 0) scale(2)",
  });
  expect(root.children[1]).toHaveStyle({
    width: "300px",
    marginLeft: "-150px",
    marginTop: "-50px",
  });
  expect(root.children[2]).toHaveStyle({
    marginLeft: "0px",
    marginTop: "0px",
    transform: "translate3d(-618px, -172px, 0)",
    maxWidth: "400px",
  });
  expect((root.children[3] as HTMLElement).style.cssText).toBe("");
  expect(artboardStyle(workspace.boards[0]!, workspace, view).transform).toBe(
    "translate3d(-418px, 20px, 0) scale(2)",
  );
});
