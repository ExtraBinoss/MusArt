import { expect, test, type Locator } from "@playwright/test";
import { createEffect, getEffectDefinition, getEffectParameter } from "@musart/core";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import labels from "../../apps/web/src/components/properties/effects/library/pink-phosphor/messages.json" with { type: "json" };
import { i18n } from "../../apps/web/src/state/i18n";
import { photographicEffect } from "./support/photographic-effect";

// Keep byte-exact PNG comparisons without formatting enormous Buffer diffs on an interim frame.
const digest = (image: Buffer) => createHash("sha256").update(image).digest("hex");

async function settled(node: Locator) {
  await node.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}
async function pulse(node: Locator) {
  return node.evaluate((element) => {
    const animation = element
      .getAnimations()
      .find((item) => "animationName" in item && item.animationName === "reset-feedback-pulse");
    return animation
      ? {
          name: (animation as CSSAnimation).animationName,
          duration: animation.effect!.getTiming().duration,
          time: Number(animation.currentTime),
        }
      : null;
  });
}
test("effect controls reset once, share feedback and keep one photographic color picker", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  const s = await photographicEffect(page, "pink-phosphor", false);
  try {
    const definition = getEffectDefinition("pink-phosphor");
    const projectId = await s.load({
      id: "polish",
      amount: 0.4,
      scale: 6,
      seed: 99,
      time: 12,
      opacity: 0.6,
      blendMode: "multiply",
      composite: "source-in",
      settings: { ...definition.defaults.settings, exposure: 1, background: "#334455" },
    });
    await expect(page.locator(".canvas-help")).toHaveCount(0);
    await page.getByRole("button", { name: i18n.t("hand"), exact: true }).click();
    await expect(page.locator(".canvas-help")).toBeVisible();
    await page.getByRole("button", { name: i18n.t("pointer"), exact: true }).click();
    await expect(page.locator(".canvas-help")).toHaveCount(0);
    await page.evaluate(() => window.musart!.select(["pink-phosphor-image"]));
    const trigger = page.locator('[data-attachment-effect-id="polish"]');
    const fx = page.locator(".layer-attachment-popover");
    const read = () => page.evaluate(() => window.musart!.snapshot());
    const effect = async () => (await read()).project.pages[0]!.layers[0]!.effects[0]!;
    await trigger.click();
    await settled(fx);
    const reset = fx.locator("[data-effect-reset]");
    expect((await reset.innerText()).trim()).toBe("");
    await expect(reset.locator("svg")).toHaveCount(1);
    const before = await read(),
      original = await effect();
    await reset.click();
    const defaults = createEffect("pink-phosphor", { id: "polish" });
    const values = (item: typeof defaults) =>
      definition.parameters.map((p) => getEffectParameter(item, p));
    expect(values(await effect())).toEqual(values(defaults));
    expect(await effect()).toMatchObject({
      opacity: 1,
      blendMode: "normal",
      enabled: original.enabled,
    });
    expect((await effect()).composite).toBeUndefined();
    expect((await read()).revision).toBe(before.revision + 1);
    await page.getByRole("button", { name: i18n.t("undo"), exact: true }).click();
    expect(await effect()).toEqual(original);
    expect((await read()).canUndo).toBe(false);
    await page.getByRole("button", { name: i18n.t("redo"), exact: true }).click();
    expect(values(await effect())).toEqual(values(defaults));
    await expect(fx).toHaveCount(0);
    await trigger.click();
    await settled(fx);
    const controls = fx.locator(".effect-controls");
    await expect(controls).toHaveCSS("row-gap", "6px");
    const heights = await fx
      .locator(
        '.effect-parameter-row > .number-field,.effect-color-field,.effect-compositing .number-field,.effect-compositing [data-slot="select-trigger"]',
      )
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    for (const height of heights) expect(height).toBeCloseTo(30, 2);
    const exposure = fx.getByRole("textbox", { name: labels.fr.parameter.exposure, exact: true });
    await exposure.fill("1.5");
    await exposure.press("Tab");
    const numeric = exposure.locator("..");
    const numericLabel = numeric.getByRole("button");
    await numericLabel.dblclick();
    expect((await effect()).settings!.exposure).toBe(0);
    expect(await pulse(numeric)).toMatchObject({ name: "reset-feedback-pulse", duration: 320 });
    await numeric.evaluate((node) => {
      node.getAnimations()[0]!.currentTime = 200;
    });
    const noOpRevision = (await read()).revision;
    await numericLabel.dblclick();
    expect((await read()).revision).toBe(noOpRevision);
    expect((await pulse(numeric))!.time).toBeLessThan(160);
    const colors = fx.locator(".effect-color-field");
    await fx.locator(".layer-attachment-viewport").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const first = colors.filter({ hasText: labels.fr.parameter.background });
    const second = colors.filter({ hasText: labels.fr.parameter.phosphor });
    const firstTrigger = first.getByRole("button", {
      name: labels.fr.parameter.background,
      exact: true,
    });
    const secondTrigger = second.getByRole("button", {
      name: labels.fr.parameter.phosphor,
      exact: true,
    });
    const canvas = page.locator(".editor-gpu-scene canvas");
    await s.ready(projectId);
    const canonical = digest(await canvas.screenshot()),
      untouched = await effect();
    await firstTrigger.click();
    const picker = page.locator('.effect-color-popover[data-state="open"]');
    await settled(picker);
    expect(
      (await firstTrigger.boundingBox())!.x -
        ((await picker.boundingBox())!.x + (await picker.boundingBox())!.width),
    ).toBeCloseTo(12, 0);
    await picker.getByRole("textbox").fill("#abcdef");
    await expect.poll(async () => digest(await canvas.screenshot())).not.toBe(canonical);
    expect(await effect()).toEqual(untouched);
    await secondTrigger.click();
    await expect(picker).toHaveCount(1);
    await settled(picker);
    await expect(picker.getByRole("textbox")).toHaveValue(
      String(defaults.settings!.phosphor).toUpperCase(),
    );
    await expect.poll(async () => digest(await canvas.screenshot())).toBe(canonical);
    expect(await effect()).toEqual(untouched);
    expect((await read()).revision).toBe(noOpRevision);
    await picker.getByRole("textbox").fill("#aabbcc");
    await picker.getByRole("textbox").press("Enter");
    expect((await effect()).settings!.phosphor).toBe("#aabbcc");
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    const colorLabel = second.locator(".effect-color-label");
    await colorLabel.dblclick();
    expect((await effect()).settings!.phosphor).toBe(defaults.settings!.phosphor);
    expect(await pulse(second)).toMatchObject({ name: "reset-feedback-pulse", duration: 320 });
    const defaultRevision = (await read()).revision;
    await colorLabel.dblclick();
    expect((await read()).revision).toBe(defaultRevision);
    await expect(second).not.toHaveAttribute("data-resetting");
    await mkdir("artifacts/effect-control-polish", { recursive: true });
    await page.screenshot({ path: "artifacts/effect-control-polish/controls.png" });
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(s.errors).toEqual([]);
  } finally {
    await s.close();
  }
});
