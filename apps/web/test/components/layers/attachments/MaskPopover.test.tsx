import { expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { MaskPopover } from "../../../../src/components/layers/attachments/MaskPopover";
import { useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
test("a locked mask explains why controls are disabled and unlocks its actual layer once", () => {
  const d = setup();
  d.engine.execute({ type: "attachLayerMask", sourceId: d.rectangle.id, targetId: d.image.id });
  d.engine.execute({ type: "updateLayers", ids: [d.image.id], patch: { locked: true } });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return (
      <MaskPopover engine={d.engine} page={page} layer={page.layers[2]!} run={d.run}>
        <button>Mask</button>
      </MaskPopover>
    );
  }
  d.mount(<Live />);
  fireEvent.click(screen.getByRole("button", { name: "Mask" }));
  expect(screen.getByRole("status")).toHaveTextContent("Ce calque est verrouillé");
  expect(screen.getByRole("combobox", { name: "Mode du masque" })).toBeDisabled();
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask).toEqual(
    before.project.pages[0]!.layers[2]!.mask,
  );
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("a mask avatar edits the real linked mask with independent undoable commands", async () => {
  const d = setup();
  d.engine.execute({ type: "attachLayerMask", sourceId: d.rectangle.id, targetId: d.image.id });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return (
      <MaskPopover engine={d.engine} page={page} layer={page.layers[2]!} run={d.run}>
        <button>Mask</button>
      </MaskPopover>
    );
  }
  d.mount(<Live />);
  fireEvent.click(screen.getByRole("button", { name: "Mask" }));
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner la source du masque" }));
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.click(screen.getByLabelText("Inverser le masque"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask?.inverted).toBe(true);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  await choose("Mode du masque", "Luminosité");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask?.mode).toBe("luminance");
  const beforeRemoval = d.engine.getSnapshot().project;
  fireEvent.click(screen.getByLabelText("Retirer le masque"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.id)).toEqual(
    beforeRemoval.pages[0]!.layers.map((layer) => layer.id),
  );
  expect(d.engine.getSnapshot().project.pages[0]!.layers[2]!.mask).toBeNull();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(beforeRemoval);
});
