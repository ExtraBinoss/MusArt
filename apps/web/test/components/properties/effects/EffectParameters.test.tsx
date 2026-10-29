import { useState } from "react";
import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  createEffect,
  getEffectDefinition,
  GRADIENT_PRESETS,
  EFFECT_CATALOG,
  isEffectParameterVisible,
  type EffectType,
} from "@musart/core";
import { EffectParameters } from "../../../../src/components/properties/effects/EffectParameters";
import { i18n } from "../../../../src/state/i18n";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
test("the icon resets every parameter and effect composition together, preserving enable state", () => {
  const d = setup(),
    change = vi.fn(),
    cancel = vi.fn();
  const effect = createEffect("pink-phosphor", {
    amount: 0.3,
    time: 6,
    enabled: false,
    opacity: 0.4,
    blendMode: "screen",
    composite: "source-over",
  });
  const view = d.mount(<EffectParameters effect={effect} onChange={change} onCancel={cancel} />);
  const reset = screen.getByRole("button", {
    name: "Réinitialiser tous les paramètres de l’effet",
  });
  expect(reset.textContent).toBe("");
  fireEvent.click(reset);
  expect(cancel).toHaveBeenCalledOnce();
  expect(change).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      ...getEffectDefinition(effect.type).defaults,
      enabled: false,
      opacity: 1,
      blendMode: "normal",
      composite: undefined,
    }),
    false,
  );
  change.mockClear();
  view.rerender(<EffectParameters effect={createEffect("pink-phosphor")} onChange={change} />);
  fireEvent.click(reset);
  expect(change).not.toHaveBeenCalled();
  expect(reset.closest(".effect-controls")).toHaveAttribute("data-resetting");
  view.rerender(<EffectParameters effect={effect} onChange={change} disabled />);
  fireEvent.click(reset);
  expect(change).not.toHaveBeenCalled();
});
test("effect colors share one active picker and cancel the preceding color draft", async () => {
  const d = setup(),
    cancel = vi.fn(),
    change = vi.fn(),
    effect = createEffect("pink-phosphor");
  d.mount(<EffectParameters effect={effect} onChange={change} onCancel={cancel} />);
  const colors = getEffectDefinition(effect.type).parameters.filter((p) => p.kind === "color");
  fireEvent.click(screen.getByRole("button", { name: i18n.t(colors[0]!.labelKey) }));
  const first = await screen.findByRole("textbox", { name: "Couleur hexadécimale" });
  fireEvent.change(first, { target: { value: "#123456" } });
  fireEvent.click(screen.getByRole("button", { name: i18n.t(colors[1]!.labelKey) }));
  expect(document.querySelectorAll('.effect-color-popover[data-state="open"]')).toHaveLength(1);
  expect(screen.getAllByRole("textbox", { name: "Couleur hexadécimale" })).toHaveLength(1);
  expect(cancel).toHaveBeenCalled();
  expect(change.mock.calls.every((call) => call[1] === true)).toBe(true);
});
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
test.each(Object.keys(EFFECT_CATALOG) as EffectType[])(
  "%s renders every real catalogue parameter with its translated label",
  (type) => {
    const d = setup(),
      effect = createEffect(type),
      definition = getEffectDefinition(type);
    d.mount(<EffectParameters effect={effect} onChange={vi.fn()} />);
    for (const parameter of definition.parameters.filter((parameter) =>
      isEffectParameterVisible(effect, parameter),
    )) {
      const label = i18n.t(parameter.labelKey);
      expect(label).not.toContain(":");
      expect(
        screen.getByRole(
          parameter.kind === "number"
            ? "textbox"
            : parameter.kind === "boolean"
              ? "switch"
              : parameter.kind === "select"
                ? "combobox"
                : "button",
          { name: label },
        ),
      ).toBeVisible();
    }
  },
);
test("Dither and Grain expose actual seeds while ASCII keeps its fixed glyph quantization private", () => {
  const d = setup(),
    change = vi.fn();
  const view = d.mount(<EffectParameters effect={createEffect("dither")} onChange={change} />);
  const seed = screen.getByRole("textbox", { name: "Graine" });
  fireEvent.change(seed, { target: { value: "145" } });
  fireEvent.blur(seed);
  expect(change).toHaveBeenLastCalledWith({ seed: 145 }, false);
  view.rerender(<EffectParameters effect={createEffect("grain")} onChange={change} />);
  expect(screen.getByRole("textbox", { name: "Graine" })).toBeVisible();
  view.rerender(<EffectParameters effect={createEffect("ascii")} onChange={change} />);
  expect(screen.queryByRole("textbox", { name: "Graine" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Niveaux" })).not.toBeInTheDocument();
});
test("Gradient treatment controls expose actual Dither levels and fine chromatic shift in document units", () => {
  const d = setup(),
    change = vi.fn();
  const view = d.mount(
    <EffectParameters
      effect={createEffect("gradient", { settings: { treatment: "none" } })}
      onChange={change}
    />,
  );
  expect(screen.queryByRole("switch", { name: "Couleur" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Niveaux" })).not.toBeInTheDocument();
  view.rerender(
    <EffectParameters
      effect={createEffect("gradient", { settings: { treatment: "dither" } })}
      onChange={change}
    />,
  );
  expect(screen.getByRole("switch", { name: "Couleur" })).toBeVisible();
  const levels = screen.getByRole("textbox", { name: "Niveaux" });
  fireEvent.change(levels, { target: { value: "128" } });
  fireEvent.blur(levels);
  expect(change).toHaveBeenLastCalledWith({ levels: 128 }, false);
  const chromatic = getEffectDefinition("gradient").parameters.find(
    (parameter) => parameter.key === "chromaticShift",
  )!;
  const field = screen.getByRole("textbox", { name: i18n.t(chromatic.labelKey) });
  fireEvent.change(field, { target: { value: "5" } });
  fireEvent.blur(field);
  expect(change).toHaveBeenLastCalledWith(
    expect.objectContaining({ settings: expect.objectContaining({ chromaticShift: 0.005 }) }),
    false,
  );
});
test("Stripe's used third and fourth colors stay editable for an imported two-color setting", () => {
  const d = setup(),
    change = vi.fn();
  d.mount(
    <EffectParameters
      effect={createEffect("gradient", { settings: { style: "stripes", colorCount: 2 } })}
      onChange={change}
    />,
  );
  for (let index = 1; index <= 4; index++)
    expect(screen.getByRole("button", { name: `Couleur ${index}` })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Couleur 5" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Couleurs" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Couleur 3" }));
  const color = screen.getByRole("textbox", { name: "Couleur hexadécimale" });
  fireEvent.change(color, { target: { value: "#123456" } });
  fireEvent.pointerUp(color);
  expect(change).toHaveBeenLastCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({ style: "stripes", color2: "#123456" }),
    }),
    false,
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
