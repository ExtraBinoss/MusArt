import { expect, it } from "vitest";
import {
  arrangeArtboards,
  artboardAt,
  viewForArtboard,
} from "../../../src/canvas/artboards/layout";
import { clientToPage } from "../../../src/canvas/viewport/view";

it("arranges stable two-column shelves with exact union bounds and gaps", () => {
  const pages = [
    { id: "a", name: "A", width: 200, height: 160 },
    { id: "b", name: "B", width: 300, height: 100 },
    { id: "c", name: "C", width: 100, height: 240 },
  ];
  expect(arrangeArtboards([])).toEqual({ width: 0, height: 0, boards: [] });
  const layout = arrangeArtboards(pages);
  expect(layout).toEqual({
    width: 628,
    height: 528,
    boards: [
      { ...pages[0], x: 0, y: 0 },
      { ...pages[1], x: 328, y: 0 },
      { ...pages[2], x: 0, y: 288 },
    ],
  });
  expect(arrangeArtboards([...pages, { ...pages[0]!, id: "d" }]).boards.slice(0, 3)).toEqual(
    layout.boards,
  );
  expect(artboardAt(layout, { x: 400, y: 90 })?.id).toBe("b");
  expect(artboardAt(layout, { x: 270, y: 90 })).toBeUndefined();
  expect(artboardAt(layout, { x: -1, y: 90 })).toBeUndefined();
  expect(artboardAt(layout, { x: 10, y: -1 })).toBeUndefined();
  expect(artboardAt(layout, { x: 10, y: 700 })).toBeUndefined();
});

it("keeps page-local pointer coordinates invariant under workspace pan and zoom", () => {
  const workspace = arrangeArtboards([
    { id: "a", name: "A", width: 200, height: 160 },
    { id: "b", name: "B", width: 300, height: 100 },
  ]);
  const board = workspace.boards[1]!,
    rect = { left: 20, top: 30, width: 1000, height: 800 };
  for (const zoom of [0.1, 1, 4]) {
    const view = { x: 37, y: -45, zoom },
      local = { x: 63, y: 22 };
    const client = {
      x: rect.left + rect.width / 2 + view.x + (board.x + local.x - workspace.width / 2) * zoom,
      y: rect.top + rect.height / 2 + view.y + (board.y + local.y - workspace.height / 2) * zoom,
    };
    expect(
      clientToPage(client, rect, viewForArtboard(view, workspace, board), board).x,
    ).toBeCloseTo(local.x);
    expect(
      clientToPage(client, rect, viewForArtboard(view, workspace, board), board).y,
    ).toBeCloseTo(local.y);
  }
  const single = arrangeArtboards([workspace.boards[0]!]),
    view = { x: 10, y: 20, zoom: 2 };
  expect(viewForArtboard(view, single, single.boards[0]!)).toEqual(view);
});
