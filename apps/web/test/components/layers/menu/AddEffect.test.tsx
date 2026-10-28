import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { AddEffect } from "../../../../src/components/layers/menu/AddEffect";
import { setup } from "../../../support/ui";
import { i18n } from "../../../../src/state/i18n";
test("visible effect and correction buttons list real categories and apply to actual selection", async () => {
  const d = setup();
  d.engine.select([d.rectangle.id, d.text.id]);
  d.mount(
    <>
      <AddEffect
        engine={d.engine}
        page={d.engine.getSnapshot().project.pages[0]!}
        selection={[d.rectangle.id, d.text.id]}
        run={d.run}
        category="effect"
      />
      <AddEffect
        engine={d.engine}
        page={d.engine.getSnapshot().project.pages[0]!}
        selection={[]}
        run={d.run}
        category="adjustment"
      />
    </>,
  );
  expect(screen.getByLabelText("Ajouter un réglage")).toBeDisabled();
  fireEvent.pointerDown(screen.getByLabelText("Ajouter un effet"), { button: 0, ctrlKey: false });
  expect(await screen.findByRole("menuitem", { name: "Flou" })).toBeVisible();
  expect(screen.queryByRole("menuitem", { name: "Luminosité" })).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: "Flou" }));
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .every((l) => l.effects[0]?.type === "blur"),
  ).toBe(true);
  d.engine.undo();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("stable parent props skip effect-control renders while selection, category, handlers and language remain live", async () => {
  history.replaceState({}, "", "/?automation=1");
  const d = setup();
  let snapshot = d.engine.getSnapshot();
  const props = {
    engine: d.engine,
    page: snapshot.project.pages[0]!,
    selection: snapshot.selection,
    run: d.run,
    category: "effect" as const,
  };
  const view = d.mount(<AddEffect {...props} />),
    trigger = screen.getByLabelText("Ajouter un effet");
  const initial = trigger.dataset.reactRenders;
  view.rerender(<AddEffect {...props} />);
  view.rerender(<AddEffect {...props} />);
  expect(trigger.dataset.reactRenders).toBe(initial);
  expect(trigger).toBeDisabled();
  act(() => d.engine.select([d.rectangle.id]));
  snapshot = d.engine.getSnapshot();
  const run = vi.fn((task: () => void) => task());
  const selected = { ...props, selection: snapshot.selection, run };
  view.rerender(<AddEffect {...selected} category="adjustment" />);
  expect(screen.getByLabelText("Ajouter un réglage")).toBeEnabled();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Luminosité" }));
  expect(run).toHaveBeenCalledOnce();
  expect(d.run).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.type).toBe("brightness");
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  snapshot = d.engine.getSnapshot();
  view.rerender(
    <AddEffect {...selected} page={snapshot.project.pages[0]!} category="adjustment" />,
  );
  expect(trigger).toBeDisabled();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByLabelText("Add adjustment")).toBe(trigger);
  await act(async () => {
    await i18n.changeLanguage("fr");
  });
  history.replaceState({}, "", "/");
});
