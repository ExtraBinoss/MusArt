import { expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MaskProperties } from "../../../src/components/properties/MaskProperties";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
import { choose } from "../../support/select";
test("toggles, inverts, changes mode and removes an editable linked layer mask", async () => {
  const d = setup();
  d.engine.execute({ type: "attachLayerMask", sourceId: d.rectangle.id, targetId: d.image.id });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const page = useEngine(d.engine).project.pages[0]!;
    return (
      <MaskProperties
        engine={d.engine}
        layer={page.layers.find((layer) => layer.id === d.image.id)!}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  fireEvent.click(screen.getByLabelText("Inverser le masque"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask?.inverted).toBe(true);
  fireEvent.click(screen.getByLabelText("Activer le masque"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask?.enabled).toBe(false);
  await choose("Mode du masque", "Luminosité");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask?.mode).toBe("luminance");
  fireEvent.click(screen.getByLabelText("Retirer le masque"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask).toBeNull();
  expect(screen.queryByText("Masque")).toBeNull();
});
