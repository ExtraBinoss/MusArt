import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
test("locked FX show an actionable notice and preserve the effect while unlocking once", () => {
  const d = fixture();
  act(() => {
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } });
    d.engine.load(d.engine.getSnapshot().project);
  });
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  expect(screen.getByRole("status")).toHaveTextContent("Ce calque est verrouillé");
  expect(
    screen.getAllByRole("button", { name: "Réinitialiser tous les paramètres de l’effet" })[0],
  ).toBeDisabled();
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toEqual(
    before.project.pages[0]!.layers[0]!.effects,
  );
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("reset all is one undoable edit of its effect including blend, opacity and alpha composition", () => {
  const d = fixture();
  act(() => {
    const page = d.engine.getSnapshot().project.pages[0]!,
      layer = page.layers[0]!;
    d.engine.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: {
        effects: layer.effects.map((fx, index) =>
          index
            ? fx
            : {
                ...fx,
                amount: 0.3,
                seed: 145,
                opacity: 0.4,
                blendMode: "screen",
                composite: "source-in",
              },
        ),
      },
    });
    d.engine.load(d.engine.getSnapshot().project);
  });
  const before = d.engine.getSnapshot();
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Réinitialiser tous les paramètres de l’effet" })[0]!,
  );
  const after = d.engine.getSnapshot();
  expect(after.revision).toBe(before.revision + 1);
  expect(after.project.pages[0]!.layers[0]!.effects[0]).toMatchObject({
    amount: 1,
    seed: 42,
    opacity: 1,
    blendMode: "normal",
  });
  expect(after.project.pages[0]!.layers[0]!.effects[0]!.composite).toBeUndefined();
  expect(after.project.pages[0]!.layers[0]!.effects[1]).toEqual(
    before.project.pages[0]!.layers[0]!.effects[1],
  );
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
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
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  const next = screen.getAllByLabelText("Intensité")[0]!;
  fireEvent.change(next, { target: { value: "45" } });
  fireEvent.blur(next);
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
test("real alpha composition previews cancel and commits restore the sparse default with one undo", async () => {
  const d = fixture();
  fireEvent.click(screen.getByRole("button", { name: "FX" }));
  const fields = screen.getAllByRole("combobox", { name: "Composition alpha" });
  expect(fields).toHaveLength(2);
  const before = d.engine.getSnapshot();
  fireEvent.pointerDown(fields[0]!, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.pointerMove(await screen.findByRole("option", { name: "Source au-dessus" }));
  expect(d.store.get(previewAtom)).toMatchObject({
    patch: { effects: [expect.objectContaining({ composite: "source-over" }), expect.anything()] },
  });
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.pointerDown(fields[0]!, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: "Source au-dessus" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.composite).toBe(
    "source-over",
  );
  expect(d.engine.getSnapshot().revision).toBe(before.revision + 1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.pointerDown(fields[0]!, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: "Source seule" }));
  const composite = screen.getAllByRole("combobox", { name: "Composition alpha" })[0]!;
  fireEvent.pointerDown(composite, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: "Remplacement de l’effet (défaut)" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]).not.toHaveProperty(
    "composite",
  );
});
test("rapid Escape/reopen resets the FX viewport and draft while retaining the outer exit animation", async () => {
  const computedStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computedStyle.call(window, element, pseudo);
    if (element.matches(".layer-attachment-popover"))
      Object.defineProperty(style, "animationName", {
        configurable: true,
        get: () => (element.getAttribute("data-state") === "closed" ? "fx-exit" : "fx-enter"),
      });
    return style;
  });
  const d = fixture();
  const original = d.engine.getSnapshot().project;
  const trigger = screen.getByRole("button", { name: "FX" });
  fireEvent.click(trigger);
  const popup = screen.getByRole("dialog");
  const viewport = popup.querySelector<HTMLElement>(".layer-attachment-viewport")!;
  const amount = screen.getAllByLabelText("Intensité")[0]!;
  fireEvent.change(amount, { target: { value: "30" } });
  expect(d.store.get(previewAtom)).not.toBeNull();
  viewport.scrollTop = 600;
  fireEvent.scroll(viewport);
  fireEvent.keyDown(amount, { key: "Escape" });
  expect(popup).toBeInTheDocument();
  expect(popup).toHaveAttribute("data-state", "closed");
  expect(popup).toHaveClass("data-[state=closed]:animate-out");
  expect(viewport.scrollTop).toBe(600);
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog")).toBe(popup);
  const reopened = popup.querySelector<HTMLElement>(".layer-attachment-viewport")!;
  expect(reopened).not.toBe(viewport);
  expect(viewport).not.toBeInTheDocument();
  expect(reopened.scrollTop).toBe(0);
  expect(screen.getAllByLabelText("Intensité")[0]).toHaveValue("100");
  fireEvent.blur(amount);
  expect(d.engine.getSnapshot().project).toBe(original);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.keyDown(popup, { key: "Escape" });
  expect(popup).toHaveAttribute("data-state", "closed");
  const end = new Event("animationend", { bubbles: true });
  Object.defineProperty(end, "animationName", { value: "fx-exit" });
  fireEvent(popup, end);
  await waitFor(() => expect(popup).not.toBeInTheDocument());
});
