import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createEffect } from "@musart/core";
import { LayerMenu } from "../../../src/components/layers/LayerMenu";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
import { i18n } from "../../../src/state/i18n";
import { attachmentSelection } from "../../../src/state/selection/attachments";
test("groups and creates masks from the actual selected layers", async () => {
  const d = setup();
  d.engine.select([d.rectangle.id, d.image.id]);
  function Live() {
    const s = useEngine(d.engine);
    return (
      <LayerMenu engine={d.engine} page={s.project.pages[0]!} selection={s.selection} run={d.run} />
    );
  }
  d.mount(<Live />);
  fireEvent.pointerDown(screen.getByLabelText("Actions des calques"), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Créer un masque avec la sélection" }),
  );
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === d.image.id)!.mask
      ?.layerId,
  ).toBe(d.rectangle.id);
});

test("stable parent updates skip the heading while selection, action, attachment and language changes stay current", async () => {
  history.replaceState({}, "", "/?automation=1");
  const d = setup(),
    effect = createEffect("brightness");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  let snapshot = d.engine.getSnapshot();
  const props = {
    engine: d.engine,
    page: snapshot.project.pages[0]!,
    selection: snapshot.selection,
    run: d.run,
  };
  const view = d.mount(<LayerMenu {...props} />),
    trigger = screen.getByLabelText("Actions des calques");
  const initial = trigger.dataset.reactRenders;
  view.rerender(<LayerMenu {...props} />);
  view.rerender(<LayerMenu {...props} />);
  expect(trigger.dataset.reactRenders).toBe(initial);
  act(() => d.engine.select([d.rectangle.id]));
  snapshot = d.engine.getSnapshot();
  const run = vi.fn((task: () => void) => task());
  const selected = { ...props, selection: snapshot.selection, run };
  view.rerender(<LayerMenu {...selected} />);
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Dupliquer la sélection" }));
  expect(run).toHaveBeenCalledOnce();
  expect(d.run).not.toHaveBeenCalled();
  act(() => {
    d.engine.undo();
    d.engine.select([d.rectangle.id]);
  });
  snapshot = d.engine.getSnapshot();
  const page = snapshot.project.pages[0]!;
  view.rerender(<LayerMenu {...selected} page={page} selection={snapshot.selection} />);
  const beforeAttachment = Number(trigger.dataset.reactRenders);
  act(() => {
    attachmentSelection(d.engine).select(page, {
      kind: "effect",
      pageId: page.id,
      layerId: d.rectangle.id,
      effectId: effect.id,
    });
  });
  expect(Number(trigger.dataset.reactRenders)).toBeGreaterThan(beforeAttachment);
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  expect(await screen.findByRole("menuitem", { name: "Retirer l’effet" })).toBeEnabled();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByLabelText("Layer actions")).toBe(trigger);
  await act(async () => {
    await i18n.changeLanguage("fr");
  });
  history.replaceState({}, "", "/");
});
