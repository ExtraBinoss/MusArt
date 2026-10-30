import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  planMotionInitialization,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("real number, choice, color and switch rows share value and keyframe columns", async ({
  page,
}) => {
  test.setTimeout(30_000);
  const output = "artifacts/effect-properties-layout";
  await mkdir(output, { recursive: true });
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          width: 320,
          height: 240,
          layers: [
            createLayer("rectangle", {
              id: "aligned-layer",
              width: 150,
              height: 120,
              effects: [
                createEffect("gradient", { id: "aligned-gradient" }),
                createEffect("dither", { id: "aligned-dither" }),
              ],
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: planMotionInitialization(engine.getSnapshot()),
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["aligned-layer"]);
  }, engine.getSnapshot().project);
  const samples: { kind: string; value: number; diamondRight: number; width: number }[] = [];
  for (const id of ["aligned-gradient", "aligned-dither"]) {
    await page.locator(`[data-attachment-effect-id="${id}"]`).first().click();
    const panel = page.locator('.layer-attachment-popover[data-state="open"]');
    await expect(panel).toBeVisible();
    await panel.evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    const rows = panel.locator(".effect-parameter-row[data-parameter-kind]");
    await expect(rows.first().locator("[data-motion-diamond]")).toBeVisible();
    samples.push(
      ...(await rows.evaluateAll((rows) =>
        rows.map((row) => {
          const kind = (row as HTMLElement).dataset.parameterKind!;
          const selector =
            kind === "number"
              ? ".number-field input"
              : kind === "boolean"
                ? '[data-slot="switch"]'
                : kind === "select"
                  ? '[data-slot="select-trigger"]'
                  : ".effect-color-field > button:not(.effect-color-label)";
          const field = row.querySelector(selector)!,
            diamond = row.querySelector("[data-motion-diamond]")!;
          const bounds = row.getBoundingClientRect(),
            value = field.getBoundingClientRect(),
            key = diamond.getBoundingClientRect();
          return {
            kind,
            value: value.left - bounds.left,
            diamondRight: bounds.right - key.right,
            width: bounds.width,
          };
        }),
      )),
    );
    await page.screenshot({ path: `${output}/${id}.png` });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }
  expect(new Set(samples.map((sample) => sample.kind))).toEqual(
    new Set(["number", "select", "color", "boolean"]),
  );
  expect(samples.every((sample) => sample.width > 200)).toBe(true);
  // Compare proportional columns: each popover can be independently positioned/clamped.
  const starts = samples.map((sample) => sample.value / (sample.width - 32));
  expect(Math.max(...starts) - Math.min(...starts)).toBeLessThan(0.01);
  expect(
    Math.max(...samples.map((sample) => sample.diamondRight)) -
      Math.min(...samples.map((sample) => sample.diamondRight)),
  ).toBeLessThan(1);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  expect(errors).toEqual([]);
  await writeFile(`${output}/report.json`, JSON.stringify({ samples, reads, errors }, null, 2));
});
