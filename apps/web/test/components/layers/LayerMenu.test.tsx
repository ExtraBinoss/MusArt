import { expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { LayerMenu } from "../../../src/components/layers/LayerMenu";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
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
