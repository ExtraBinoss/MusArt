import { expect, type Locator, type Page } from "@playwright/test";
import { BLEND_MODES, EFFECT_COMPOSITE_MODES } from "@musart/core";
import { measureControl, stableEffectSelection, type ControlSample } from "./effect-control-input";

/** The common effect header remains real, undoable and selected for every effect type. */
export async function exerciseEffectComposition(
  page: Page,
  popup: Locator,
  layerId: string,
  ready: () => Promise<void>,
) {
  const samples: ControlSample[] = [];
  const read = () =>
    page.evaluate(() => {
      const snapshot = window.musart!.snapshot();
      return {
        revision: snapshot.revision,
        effect: snapshot.project.pages[0]!.layers[0]!.effects[0]!,
      };
    });
  for (const property of ["opacity", "blendMode", "composite"] as const) {
    const before = await read();
    if (property === "opacity") {
      const input = popup.locator(".effect-compositing").getByRole("textbox");
      samples.push(await measureControl(page, "opacity:preview", "input", () => input.fill("87")));
      expect(await read()).toEqual(before);
      await input.press("Enter");
      expect((await read()).effect.opacity).toBe(0.87);
    } else {
      const trigger = popup.getByRole("combobox", {
        name: property === "blendMode" ? "Blend mode" : "Alpha composition",
        exact: true,
      });
      samples.push(
        await measureControl(
          page,
          `${property}:open`,
          "pointerdown",
          () => trigger.click(),
          '[role="listbox"]',
        ),
      );
      await stableEffectSelection(page, layerId);
      expect(await read()).toEqual(before);
      await page.getByRole("option").nth(1).click();
      await expect(page.getByRole("listbox")).toHaveCount(0);
      expect((await read()).effect[property]).toBe(
        property === "blendMode" ? BLEND_MODES[1] : EFFECT_COMPOSITE_MODES[0],
      );
    }
    expect((await read()).revision).toBe(before.revision + 1);
    await stableEffectSelection(page, layerId);
    await ready();
    await page.evaluate(() => window.musart!.undo());
    expect((await read()).effect).toEqual(before.effect);
    expect((await read()).revision).toBe(before.revision + 2);
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  }
  return samples;
}
