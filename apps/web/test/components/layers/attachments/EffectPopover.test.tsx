import { expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createEffect, createProject } from "@musart/core";
import { EffectPopover } from "../../../../src/components/layers/attachments/EffectPopover";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
function fixture() {
  const d = setup();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id],
    patch: { effects: [createEffect("dither"), createEffect("contrast")] },
  });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!,
      layer = page.layers[0]!;
    return layer ? (
      <EffectPopover engine={d.engine} page={page} layer={layer} run={d.run}>
        <button>FX</button>
      </EffectPopover>
    ) : null;
  }
  d.mount(<Live />);
  return d;
}
test("FX avatars expose actual blend/opacity and parameters; previews cancel or commit one transaction", async () => {
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  const amount = screen.getAllByLabelText("Intensité")[0]!;
  const scrubs = screen.getAllByRole("button", { name: "Ajuster Opacité" });
  expect(scrubs).toHaveLength(2);
  for (const scrub of scrubs) {
    expect(scrub.querySelector("svg.lucide-sun")).toHaveAttribute("aria-hidden", "true");
    expect(scrub.textContent).toBe("");
  }
  fireEvent.change(amount, { target: { value: "60" } });
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "layers",
    patch: { effects: [expect.objectContaining({ amount: 0.6 }), expect.anything()] },
  });
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.keyDown(amount, { key: "Escape" });
  fireEvent.blur(amount);
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.change(amount, { target: { value: "45" } });
  fireEvent.blur(amount);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.amount).toBe(0.45);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("effect popovers toggle, delete and blend the selected effect without touching other stages", async () => {
  const d = setup();
  const fx = createEffect("dither");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [fx] } });
  d.engine.load(d.engine.getSnapshot().project);
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return (
      <EffectPopover
        engine={d.engine}
        page={page}
        layer={page.layers[0]!}
        effectId={fx.id}
        run={d.run}
      >
        <button>FX</button>
      </EffectPopover>
    );
  }
  d.mount(<Live />);
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  await choose("Fusion", "Produit");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.blendMode).toBe(
    "multiply",
  );
  const opacity = screen.getByLabelText("Opacité");
  fireEvent.change(opacity, { target: { value: "35" } });
  fireEvent.blur(opacity);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.opacity).toBe(0.35);
  fireEvent.click(screen.getByLabelText("Désactiver l’effet"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.enabled).toBe(false);
  fireEvent.click(screen.getByLabelText("Activer l’effet"));
  fireEvent.click(screen.getByLabelText("Retirer l’effet"));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(0);
});
test("closing clears held drafts and a replaced project rejects late parameter commits", () => {
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  const amount = screen.getAllByLabelText("Intensité")[0]!;
  fireEvent.change(amount, { target: { value: "30" } });
  expect(d.store.get(previewAtom)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  const next = screen.getAllByLabelText("Intensité")[0]!;
  act(() => {
    d.engine.load(createProject());
    fireEvent.blur(next);
  });
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
