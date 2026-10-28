import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createLayer, createProject } from "@musart/core";
import { LayerRow } from "../../../../src/components/layers/rows/LayerRow";
import { setup } from "../../../support/ui";
function fixture() {
  const d = setup(),
    page = d.engine.getSnapshot().project.pages[0]!,
    onToggle = vi.fn();
  const props = {
    engine: d.engine,
    page,
    layer: page.layers[0]!,
    assets: d.project.assets,
    selected: false,
    depth: 0,
    expanded: false,
    moving: false,
    dragging: false,
    reduced: true,
    previewKey: "original",
    top: 0,
    run: d.run,
    onToggle,
    onDragEnd: vi.fn(),
    drag: { start: vi.fn(), over: vi.fn(), overTree: vi.fn(), drop: vi.fn() },
  };
  return { ...d, props };
}
test("memo rows read the current engine selection and reject stale native events before React catches up", () => {
  const d = fixture();
  d.mount(<LayerRow {...d.props} />);
  act(() => d.engine.select([d.text.id]));
  fireEvent.click(screen.getByRole("treeitem"), { ctrlKey: true });
  expect(d.engine.getSnapshot().selection).toEqual([d.text.id, d.rectangle.id]);
  fireEvent.keyDown(screen.getByRole("treeitem"), { key: " ", metaKey: true });
  expect(d.engine.getSnapshot().selection).toEqual([d.text.id]);
  fireEvent.contextMenu(screen.getByRole("treeitem"));
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  act(() => d.engine.load(createProject()));
  fireEvent.click(screen.getByRole("treeitem"));
  fireEvent.click(screen.getByLabelText("Masquer le calque · Rectangle bleu"));
  expect(d.engine.getSnapshot().selection).toEqual([]);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("row expansion, keyboard rename, controls and native drag events remain independent", () => {
  const d = fixture(),
    group = createLayer("group", { name: "Group" });
  const view = d.mount(<LayerRow {...d.props} layer={group} />);
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  expect(d.props.onToggle).toHaveBeenCalledWith(group.id, true);
  view.rerender(<LayerRow {...d.props} />);
  const row = screen.getByRole("treeitem");
  fireEvent.keyDown(row, { key: "F2" });
  const input = screen.getByLabelText("Renommer le calque");
  fireEvent.change(input, { target: { value: "Renamed" } });
  fireEvent.blur(input);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.name).toBe("Renamed");
  const page = d.engine.getSnapshot().project.pages[0]!;
  view.rerender(<LayerRow {...d.props} page={page} layer={page.layers[0]!} />);
  fireEvent.doubleClick(screen.getByRole("treeitem"));
  fireEvent.keyDown(screen.getByLabelText("Renommer le calque"), { key: "Escape" });
  expect(screen.queryByLabelText("Renommer le calque")).toBeNull();
  fireEvent.click(screen.getByLabelText("Verrouiller le calque · Renamed"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(true);
  fireEvent.dragStart(row);
  fireEvent.dragOver(row);
  fireEvent.drop(row);
  fireEvent.dragEnd(row);
  expect(d.props.drag.start).toHaveBeenCalled();
  expect(d.props.drag.over).toHaveBeenCalled();
  expect(d.props.drag.drop).toHaveBeenCalled();
  expect(d.props.onDragEnd).toHaveBeenCalled();
});
