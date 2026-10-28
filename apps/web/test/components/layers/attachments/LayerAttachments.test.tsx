import { expect, test } from "vitest";
import { createRef } from "react";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { createEffect, createProject } from "@musart/core";
import {
  LayerAttachments,
  type EffectDragSession,
} from "../../../../src/components/layers/attachments/LayerAttachments";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
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
