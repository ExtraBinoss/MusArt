import { expect, test, vi } from "vitest";
import { createRef, useLayoutEffect } from "react";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import {
  LayerAttachments,
  type EffectDragSession,
} from "../../../../src/components/layers/attachments/LayerAttachments";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { attachmentSelection } from "../../../../src/state/selection/attachments";
function fixture() {
  const d = setup(),
    first = createEffect("dither"),
    second = createEffect("contrast");
  d.engine.execute({
    type: "updateLayers",
    ids: [d.image.id],
    patch: { effects: [first, second] },
  });
  d.engine.execute({ type: "attachLayerMask", sourceId: d.rectangle.id, targetId: d.image.id });
  d.engine.load(d.engine.getSnapshot().project);
  const drag = createRef<EffectDragSession | null>();
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!,
      layer = page.layers[2]!;
    if (!layer) return null;
    return (
      <>
        {layer.effects.map((effect, i) => (
          <LayerAttachments
            key={effect.id}
            engine={d.engine}
            page={page}
            layer={layer}
            effectId={effect.id}
            mask={false}
            top={i * 36}
            depth={1}
            run={d.run}
            drag={drag}
          />
        ))}
        <LayerAttachments
          engine={d.engine}
          page={page}
          layer={layer}
          mask
          top={72}
          depth={1}
          run={d.run}
          drag={drag}
        />
      </>
    );
  }
  d.mount(<Live />);
  return { ...d, first, second, drag };
}
function transfer() {
  const values = new Map<string, string>();
  return {
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
    dropEffect: "",
  };
}

test("portaled effect fields do not run the expanded row's click and context-menu selection handlers", () => {
  const d = fixture();
  const row = document.querySelector(`[data-effect-id="${d.first.id}"]`)!;
  fireEvent.click(row.querySelector('[data-slot="popover-trigger"]')!);
  const select = vi.spyOn(attachmentSelection(d.engine), "select");
  const input = screen.getByRole("dialog").querySelector("input")!;
  const before = d.engine.getSnapshot();
  fireEvent.click(input);
  fireEvent.contextMenu(input);
  expect(select).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(before);
  expect(attachmentSelection(d.engine).read()).toMatchObject({
    kind: "effect",
    effectId: d.first.id,
  });
});
test("virtual children toggle/remove their exact effect and mask with semantic commands", () => {
  const d = fixture();
  const row = screen.getByText("Dither").closest('[role="treeitem"]')!;
  expect(row).toHaveAttribute(
    "data-layer-tree-key",
    `effect:${d.image.id.length}:${d.image.id}:${d.first.id}`,
  );
  fireEvent.click(within(row as HTMLElement).getByLabelText("Désactiver l’effet"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.effects[0]!.enabled).toBe(false);
  fireEvent.click(within(row as HTMLElement).getByLabelText("Activer l’effet"));
  fireEvent.click(within(row as HTMLElement).getByLabelText("Retirer l’effet"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.effects.map((e) => e.id)).toEqual([
    d.second.id,
  ]);
  const mask = document.querySelector("[data-mask-for]") as HTMLElement;
  expect(mask).toHaveTextContent("Rectangle bleu");
  fireEvent.click(within(mask).getByLabelText("Activer le masque"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask?.enabled).toBe(false);
  fireEvent.click(within(mask).getByLabelText("Retirer le masque"));
  expect(document.querySelector("[data-mask-for]")).toBeNull();
});
test("effect drag reorders only on final drop, supports undo and rejects a changed document", () => {
  const d = fixture(),
    dataTransfer = transfer();
  const first = () => document.querySelector(`[data-effect-id="${d.first.id}"]`)!,
    second = () => document.querySelector(`[data-effect-id="${d.second.id}"]`)!;
  fireEvent.dragStart(second(), { dataTransfer });
  fireEvent.dragOver(first(), { dataTransfer });
  expect(dataTransfer.dropEffect).toBe("move");
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.drop(first(), { dataTransfer });
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.effects.map((e) => e.id)).toEqual([
    d.second.id,
    d.first.id,
  ]);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.dragStart(second(), { dataTransfer });
  act(() => d.engine.execute({ type: "renameProject", name: "Changed" }));
  fireEvent.drop(first(), { dataTransfer });
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.effects.map((e) => e.id)).toEqual([
    d.first.id,
    d.second.id,
  ]);
  fireEvent.dragStart(first(), { dataTransfer });
  fireEvent.dragEnd(first());
  expect(d.drag.current).toBeNull();
  act(() => d.engine.load(createProject()));
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

function inactiveFixture(retainStalePage = false) {
  const d = setup(),
    first = createEffect("dither"),
    second = createEffect("contrast"),
    owner = createLayer("rectangle", {
      id: "inactive-owner",
      effects: [first, second],
      mask: { assetId: "asset1", enabled: true, inverted: false, mode: "alpha" },
    }),
    inactive = createPage({ id: "inactive-page", layers: [owner] });
  d.engine.load({ ...d.project, pages: [d.page, inactive] });
  d.engine.select([d.rectangle.id]);
  const originalPage = d.engine.getSnapshot().project.pages[1]!,
    drag = createRef<EffectDragSession | null>(),
    commits = vi.fn();
  function Live() {
    const snapshot = useEngine(d.engine),
      page = retainStalePage ? originalPage : snapshot.project.pages[1]!,
      layer = page.layers[0]!;
    useLayoutEffect(() => {
      commits(snapshot);
    });
    return (
      <>
        <LayerAttachments
          engine={d.engine}
          page={page}
          layer={layer}
          effectId={first.id}
          mask={false}
          top={0}
          depth={1}
          run={d.run}
          drag={drag}
        />
        <LayerAttachments
          engine={d.engine}
          page={page}
          layer={layer}
          mask
          top={36}
          depth={1}
          run={d.run}
          drag={drag}
        />
      </>
    );
  }
  d.mount(<Live />);
  const row = (kind: "effect" | "mask") =>
    document.querySelector<HTMLElement>(
      kind === "effect" ? `[data-effect-id="${first.id}"]` : `[data-mask-for="${owner.id}"]`,
    )!;
  return { ...d, owner, first, second, inactive, row, commits };
}

test.each(["effect", "mask"] as const)(
  "%s eye activates an inactive page and batches exact selection with one undoable edit in bubbling",
  (kind) => {
    const d = inactiveFixture(),
      before = d.engine.getSnapshot(),
      button = within(d.row(kind)).getByLabelText(
        kind === "effect" ? "Désactiver l’effet" : "Activer le masque",
      );
    const capture = vi.fn(() => ({
      snapshot: d.engine.getSnapshot(),
      target: attachmentSelection(d.engine).read(),
    }));
    button.addEventListener("click", capture, { capture: true });
    d.commits.mockClear();
    fireEvent.click(button);
    // The row's capture phase must not publish a selection before the action's bubble handler.
    expect(capture.mock.results[0]!.value).toEqual({ snapshot: before, target: null });
    const after = d.engine.getSnapshot(),
      layer = after.project.pages[1]!.layers[0]!;
    expect(after.pageId).toBe(d.inactive.id);
    expect(after.selection).toEqual([d.owner.id]);
    expect(attachmentSelection(d.engine).read()?.kind).toBe(kind);
    expect(kind === "effect" ? layer.effects[0]!.enabled : layer.mask?.enabled).toBe(false);
    expect(after.revision).toBe(before.revision + 1);
    expect(d.run).toHaveBeenCalledOnce();
    expect(d.commits).toHaveBeenCalledOnce();
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toBe(before.project);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
    act(() => d.engine.redo());
    expect(d.engine.getSnapshot().project).toBe(after.project);
  },
);

test.each(["effect", "mask"] as const)(
  "%s deletion captures its exact attachment even when another page and layer were selected",
  (kind) => {
    const d = inactiveFixture(),
      before = d.engine.getSnapshot();
    fireEvent.click(
      within(d.row(kind)).getByLabelText(
        kind === "effect" ? "Retirer l’effet" : "Retirer le masque",
      ),
    );
    const after = d.engine.getSnapshot(),
      layer = after.project.pages[1]!.layers[0]!;
    expect(after.pageId).toBe(d.inactive.id);
    expect(after.selection).toEqual([]);
    expect(after.project.pages[0]!.layers).toEqual(before.project.pages[0]!.layers);
    expect(after.project.pages[1]!.layers).toHaveLength(1);
    expect(layer.effects.map((effect) => effect.id)).toEqual(
      kind === "effect" ? [d.second.id] : [d.first.id, d.second.id],
    );
    expect(Boolean(layer.mask)).toBe(kind === "effect");
    expect(after.revision).toBe(before.revision + 1);
    expect(d.run).toHaveBeenCalledOnce();
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toBe(before.project);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
  },
);

test("stale effect and mask action handlers abort before any edit or deferred delete", () => {
  const d = inactiveFixture(true);
  act(() => d.engine.load(d.engine.getSnapshot().project));
  const replacement = d.engine.getSnapshot();
  for (const kind of ["effect", "mask"] as const) {
    fireEvent.click(
      within(d.row(kind)).getByLabelText(
        kind === "effect" ? "Désactiver l’effet" : "Activer le masque",
      ),
    );
    fireEvent.click(
      within(d.row(kind)).getByLabelText(
        kind === "effect" ? "Retirer l’effet" : "Retirer le masque",
      ),
    );
    expect(d.engine.getSnapshot()).toBe(replacement);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
  }
  expect(d.run).not.toHaveBeenCalled();
});
