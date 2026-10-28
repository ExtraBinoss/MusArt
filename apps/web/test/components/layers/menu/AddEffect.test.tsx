import { expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { AddEffect } from "../../../../src/components/layers/menu/AddEffect";
import { setup } from "../../../support/ui";
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
