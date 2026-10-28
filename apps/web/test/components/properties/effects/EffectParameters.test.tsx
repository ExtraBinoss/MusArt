import { useState } from "react";
import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { createEffect, getEffectDefinition, GRADIENT_PRESETS } from "@musart/core";
import { EffectParameters } from "../../../../src/components/properties/effects/EffectParameters";
import { i18n } from "../../../../src/state/i18n";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
test("typed settings presets/choices/colors and conditional number controls edit actual gradient fields", async () => {
  const d = setup(),
    preview = vi.fn(),
    commit = vi.fn();
  function Live() {
    const [effect, setEffect] = useState(() => createEffect("gradient"));
    return (
      <EffectParameters
        effect={effect}
        onChange={(patch, draft) => {
          if (draft) preview(patch);
          else {
            commit(patch);
            setEffect((current) => ({ ...current, ...patch }));
          }
        }}
      />
    );
  }
  d.mount(<Live />);
  const definition = getEffectDefinition("gradient");
  const label = (key: string) => i18n.t(definition.parameters.find((p) => p.key === key)!.labelKey);
  await choose(label("preset"), i18n.t(GRADIENT_PRESETS[0]!.nameKey));
  expect(commit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      seed: GRADIENT_PRESETS[0]!.seed,
      settings: expect.objectContaining({ preset: GRADIENT_PRESETS[0]!.id }),
    }),
  );
  const style = definition.parameters.find((p) => p.key === "style")!;
  if (style.kind !== "select") throw Error("style contract");
  await choose(label("style"), i18n.t(style.options.find((o) => o.value === "radial")!.labelKey));
  expect(commit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ style: "radial", preset: "custom" }),
    }),
  );
  const number = screen.getByRole("textbox", { name: label("scale") });
  fireEvent.change(number, { target: { value: "2.5" } });
  expect(preview).toHaveBeenLastCalledWith({ scale: 2.5 });
  fireEvent.blur(number);
  expect(commit).toHaveBeenLastCalledWith({ scale: 2.5 });
  fireEvent.click(screen.getByRole("button", { name: label("color0") }));
  const color = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(color, { target: { value: "#aabbcc" } });
  expect(preview).toHaveBeenLastCalledWith(
    expect.objectContaining({ settings: expect.objectContaining({ color0: "#aabbcc" }) }),
  );
  fireEvent.pointerUp(color);
  expect(commit).toHaveBeenLastCalledWith(
    expect.objectContaining({ settings: expect.objectContaining({ color0: "#aabbcc" }) }),
  );
});
test("legacy numeric and boolean parameters retain normalized document values and disabled controls", () => {
  const d = setup(),
    change = vi.fn(),
    cancel = vi.fn();
  const view = d.mount(
    <EffectParameters
      effect={createEffect("dither", { amount: 0.6 })}
      onChange={change}
      onCancel={cancel}
    />,
  );
  const amount = screen.getByLabelText("Intensité");
  fireEvent.change(amount, { target: { value: "25" } });
  expect(change).toHaveBeenCalledWith({ amount: 0.25 }, true);
  fireEvent.keyDown(amount, { key: "Escape" });
  expect(cancel).toHaveBeenCalled();
  fireEvent.doubleClick(screen.getByRole("button", { name: "Ajuster Intensité" }));
  expect(change).toHaveBeenLastCalledWith({ amount: 1 }, false);
  fireEvent.click(screen.getByRole("switch", { name: "Couleur" }));
  expect(change).toHaveBeenLastCalledWith({ color: true }, false);
  view.rerender(<EffectParameters effect={createEffect("dither")} disabled onChange={change} />);
  expect(screen.getByLabelText("Intensité")).toBeDisabled();
  expect(screen.getByRole("switch", { name: "Couleur" })).toBeDisabled();
});
