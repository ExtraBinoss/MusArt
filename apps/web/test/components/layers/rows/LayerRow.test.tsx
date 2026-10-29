import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createLayer, createPage, createProject } from "@musart/core";
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
test("rebound row shells retain their buttons but release focus and never donate rename drafts", () => {
  const d = fixture(),
    view = d.mount(<LayerRow {...d.props} />);
  const button = screen.getByLabelText("Masquer le calque · Rectangle bleu");
  button.focus();
  view.rerender(<LayerRow {...d.props} layer={d.props.page.layers[1]!} previewKey="text" />);
  expect(screen.getByLabelText("Masquer le calque · Titre")).toBe(button);
  expect(document.activeElement).toBe(document.body);
  fireEvent.keyDown(screen.getByRole("treeitem"), { key: "F2" });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Old draft" } });
  view.rerender(<LayerRow {...d.props} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.keyDown(screen.getByRole("treeitem"), { key: "F2" });
  expect(screen.getByRole("textbox")).toHaveValue("Rectangle bleu");
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
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
  const chevron = screen.getByRole("button", { name: "Group" }).querySelector("svg")!;
  expect(chevron).toHaveAttribute("data-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Group" }));
  expect(d.props.onToggle).toHaveBeenCalledWith(group.id, true);
  view.rerender(<LayerRow {...d.props} layer={group} expanded />);
  expect(screen.getByRole("button", { name: "Group" }).querySelector("svg")).toBe(chevron);
  expect(chevron).toHaveAttribute("data-expanded", "true");
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
  expect(d.props.drag.start).not.toHaveBeenCalled();
  act(() => d.engine.undo());
  const draggablePage = d.engine.getSnapshot().project.pages[0]!;
  view.rerender(<LayerRow {...d.props} page={draggablePage} layer={draggablePage.layers[0]!} />);
  fireEvent.dragStart(row);
  fireEvent.dragOver(row);
  fireEvent.drop(row);
  fireEvent.dragEnd(row);
  expect(d.props.drag.start).toHaveBeenCalled();
  expect(d.props.drag.over).toHaveBeenCalled();
  expect(d.props.drag.drop).toHaveBeenCalled();
  expect(d.props.onDragEnd).toHaveBeenCalled();
});

test("retained rows select, rename and drag through ruler metadata but reject later queued edits", () => {
  const d = fixture();
  let pending: (() => void) | undefined;
  const run = (task: () => void) => {
    pending = task;
  };
  const view = d.mount(<LayerRow {...d.props} run={run} />);
  const row = screen.getByRole("treeitem");
  fireEvent.keyDown(row, { key: "F2" });
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Metadata draft" } });
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  const metadata = d.engine.getSnapshot().project.pages[0]!;
  view.rerender(<LayerRow {...d.props} page={metadata} run={run} />);
  expect(screen.getByRole("textbox")).toBe(input);
  expect(input).toHaveValue("Metadata draft");
  expect(document.activeElement).toBe(input);
  fireEvent.keyDown(input, { key: "Enter" });
  pending!();
  const renamed = d.engine.getSnapshot().project.pages[0]!;
  expect(renamed.layers[0]!.name).toBe("Metadata draft");
  view.rerender(<LayerRow {...d.props} page={renamed} layer={renamed.layers[0]!} run={run} />);
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: false } }));
  fireEvent.click(row);
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  fireEvent.dragStart(row);
  expect(d.props.drag.start.mock.lastCall?.[2]).toBe(d.engine.getSnapshot().project.pages[0]);
  fireEvent.click(screen.getByRole("button", { name: "Masquer le calque · Metadata draft" }));
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  const changed = d.engine.getSnapshot();
  pending!();
  expect(d.engine.getSnapshot()).toBe(changed);
  act(() => d.engine.load(d.engine.getSnapshot().project));
  const replacement = d.engine.getSnapshot();
  fireEvent.click(row);
  expect(d.engine.getSnapshot()).toBe(replacement);
});

test("an owned lock has a persistent readable badge and retains one-click undoable unlocking", () => {
  const d = fixture();
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  const page = d.engine.getSnapshot().project.pages[0]!;
  const view = d.mount(<LayerRow {...d.props} page={page} layer={page.layers[0]!} />);
  const row = screen.getByRole("treeitem"),
    unlock = screen.getByRole("button", { name: "Déverrouiller le calque · Rectangle bleu" });
  expect(row).toHaveAttribute("data-locked", "true");
  expect(row).not.toHaveAttribute("data-lock-inherited");
  expect(row).toHaveClass("is-locked");
  expect(row).toHaveAttribute("draggable", "false");
  expect(unlock).toBeEnabled();
  expect(unlock).toHaveClass("layer-lock-button", "is-locked");
  expect(unlock).toHaveTextContent("Verrouillé");
  expect(unlock).toHaveAttribute("aria-description", "Verrouillé");
  expect(unlock.querySelector("svg")).toHaveClass("lucide-lock-keyhole");
  fireEvent.click(unlock);
  expect(d.run).toHaveBeenCalledOnce();
  const unlocked = d.engine.getSnapshot().project.pages[0]!;
  expect(unlocked.layers[0]!.locked).toBe(false);
  view.rerender(<LayerRow {...d.props} page={unlocked} layer={unlocked.layers[0]!} />);
  expect(row).not.toHaveAttribute("data-locked");
  expect(screen.queryByText("Verrouillé")).toBeNull();
  expect(screen.getByText("Rectangle bleu")).toHaveClass("layer-name");
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(true);
});

test("inherited locks name the actual locked ancestor and never offer a fake child unlock", () => {
  const d = fixture(),
    outer = createLayer("group", { id: "lock-owner", name: "Protected artwork", locked: true }),
    inner = createLayer("group", { id: "lock-middle", name: "Nested group", parentId: outer.id }),
    child = createLayer("rectangle", {
      id: "lock-child",
      name: "Nested artwork",
      parentId: inner.id,
    });
  act(() =>
    d.engine.load(createProject({ pages: [createPage({ layers: [outer, inner, child] })] })),
  );
  const page = d.engine.getSnapshot().project.pages[0]!;
  const view = d.mount(<LayerRow {...d.props} page={page} layer={page.layers[2]!} />);
  const row = screen.getByRole("treeitem"),
    inherited = screen.getByRole("button", {
      name: "Verrouillé par Protected artwork · Nested artwork",
    });
  expect(row).toHaveAttribute("data-locked", "true");
  expect(row).toHaveAttribute("data-lock-inherited", "true");
  expect(row).toHaveAttribute("title", "Verrouillé par Protected artwork");
  expect(row).toHaveAttribute("draggable", "false");
  expect(inherited).toBeDisabled();
  expect(inherited).toHaveTextContent("Verrouillé");
  expect(inherited.querySelector("svg")).toHaveClass("lucide-lock-keyhole");
  expect(screen.queryByRole("button", { name: /^Déverrouiller/ })).toBeNull();
  const before = d.engine.getSnapshot().project;
  fireEvent.click(inherited);
  fireEvent.doubleClick(row);
  fireEvent.keyDown(row, { key: "F2" });
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  expect(d.run).not.toHaveBeenCalled();
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(row);
  expect(d.engine.getSnapshot().selection).toEqual([child.id]);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  act(() => d.engine.execute({ type: "updateLayers", ids: [outer.id], patch: { locked: false } }));
  const unlocked = d.engine.getSnapshot().project.pages[0]!;
  view.rerender(<LayerRow {...d.props} page={unlocked} layer={unlocked.layers[2]!} />);
  expect(row).not.toHaveAttribute("data-locked");
  expect(row).not.toHaveAttribute("data-lock-inherited");
  expect(
    screen.getByRole("button", { name: "Verrouiller le calque · Nested artwork" }),
  ).toBeEnabled();
  expect(screen.queryByText("Verrouillé")).toBeNull();
});
