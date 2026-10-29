import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { LayerRowContents } from "../../../../src/components/layers/rows/LayerRowContents";
import { LayerRow } from "../../../../src/components/layers/rows/LayerRow";
import { setup } from "../../../support/ui";
import { createEffect } from "@musart/core";

const renders = vi.hoisted(() => ({ icon: vi.fn() }));
vi.mock("../../../../src/components/shared/IconButton", async (original) => {
  const module = await original<typeof import("../../../../src/components/shared/IconButton")>();
  return {
    IconButton: (props: Parameters<typeof module.IconButton>[0]) => {
      renders.icon(props.label);
      return <module.IconButton {...props} />;
    },
  };
});

test("selection highlights retain static row controls and callback bindings", () => {
  const d = setup();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id],
    patch: { effects: [createEffect("receipt")] },
  });
  d.engine.load(d.engine.getSnapshot().project);
  const page = d.engine.getSnapshot().project.pages[0]!;
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
    previewKey: "retained",
    top: 0,
    run: d.run,
    onToggle: vi.fn(),
    onDragEnd: vi.fn(),
    drag: { start: vi.fn(), over: vi.fn(), overTree: vi.fn(), drop: vi.fn() },
  };
  renders.icon.mockClear();
  const view = d.mount(<LayerRow {...props} />);
  const row = screen.getByRole("treeitem");
  const visibility = screen.getByRole("button", { name: "Masquer le calque · Rectangle bleu" });
  const effect = screen.getByRole("button", { name: "Ticket de caisse · Rectangle bleu" });
  expect(effect).toHaveAttribute("aria-expanded", "false");
  expect(renders.icon).toHaveBeenCalledTimes(2);
  view.rerender(<LayerRow {...props} selected />);
  expect(row).toHaveAttribute("aria-selected", "true");
  expect(row).toHaveClass("selected");
  expect(screen.getByRole("button", { name: "Masquer le calque · Rectangle bleu" })).toBe(
    visibility,
  );
  expect(screen.getByRole("button", { name: "Ticket de caisse · Rectangle bleu" })).toBe(effect);
  expect(effect).toHaveAttribute("aria-expanded", "false");
  expect(renders.icon).toHaveBeenCalledTimes(2);
  view.rerender(<LayerRow {...props} />);
  expect(row).toHaveAttribute("aria-selected", "false");
  expect(renders.icon).toHaveBeenCalledTimes(2);
  visibility.focus();
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  const metadata = d.engine.getSnapshot().project.pages[0]!;
  view.rerender(<LayerRow {...props} page={metadata} />);
  expect(renders.icon).toHaveBeenCalledTimes(2);
  expect(document.activeElement).toBe(visibility);
  expect(screen.getByRole("button", { name: "Ticket de caisse · Rectangle bleu" })).toBe(effect);
  fireEvent.click(visibility);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.visible).toBe(false);
  expect(d.engine.getSnapshot().canUndo).toBe(true);
  expect(d.run).toHaveBeenCalledOnce();
  const changed = d.engine.getSnapshot().project.pages[0]!;
  view.rerender(<LayerRow {...props} page={changed} layer={changed.layers[0]!} />);
  expect(renders.icon).toHaveBeenCalledTimes(4);
  expect(screen.getByRole("button", { name: "Afficher le calque · Rectangle bleu" })).toBe(
    visibility,
  );
});

test("retained contents keep rename cancellation and inherited protection controls", () => {
  const d = setup(),
    page = d.engine.getSnapshot().project.pages[0]!;
  const props = {
    engine: d.engine,
    page,
    layer: page.layers[0]!,
    assets: d.project.assets,
    previewKey: "retained",
    attachmentTarget: null,
    expanded: false,
    renaming: true,
    parentLocked: false,
    locked: false,
    lockDescription: "Verrouillé",
    anchor: { current: null },
    run: d.run,
    onToggle: vi.fn(),
    onExpand: vi.fn(),
    onRename: vi.fn(),
    onCancelRename: vi.fn(),
    onLock: vi.fn(),
    onVisibility: vi.fn(),
  };
  const view = d.mount(<LayerRowContents {...props} />);
  const input = screen.getByRole("textbox", { name: "Renommer le calque" });
  fireEvent.change(input, { target: { value: "Current draft" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(props.onRename).toHaveBeenCalledWith("Current draft");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(props.onCancelRename).toHaveBeenCalledOnce();
  view.rerender(<LayerRowContents {...props} renaming={false} locked parentLocked />);
  expect(screen.queryByRole("textbox")).toBeNull();
  const inherited = screen.getByRole("button", { name: "Verrouillé · Rectangle bleu" });
  expect(inherited).toBeDisabled();
  expect(screen.getByRole("button", { name: "Masquer le calque · Rectangle bleu" })).toBeDisabled();
  fireEvent.click(inherited);
  expect(props.onLock).not.toHaveBeenCalled();
});
