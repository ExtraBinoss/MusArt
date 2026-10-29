import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";

for (const forceWebGL of [false, true])
  test(`Live phase hands directly to a numeric label scrub without dropping or rewinding it (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    const fixture = await photographicEffect(page, "ripple", forceWebGL);
    const snapshot = () =>
      page.evaluate(() => {
        const state = window.musart!.snapshot();
        return { revision: state.revision, effect: state.project.pages[0]!.layers[0]!.effects[0]! };
      });
    try {
      await fixture.load({ time: 0, settings: { centerX: 0.5, centerY: 0.5 } });
      await page.evaluate(() => window.musart!.select(["ripple-image"]));
      await page
        .locator('[data-layer-id="ripple-image"] [data-attachment-target="effect"]')
        .click();
      await page.locator(".layer-attachment-popover").evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => undefined)),
        );
      });
      const before = await snapshot();
      const handle = page.getByRole("button", { name: /^(Ajuster Centre X|Adjust Center X)$/ });
      await expect(handle).toBeVisible();
      await page.getByRole("button", { name: /^(Animer|Play live)$/ }).click();
      await page.waitForFunction(
        () =>
          Number.parseFloat(document.querySelector(".effect-playback output")?.textContent ?? "0") >
          0.15,
      );
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const frozen = await snapshot();
      await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 8 });
      const during = await snapshot();
      await page.mouse.up();
      const changed = await snapshot();
      await mkdir("artifacts/effect-handoff", { recursive: true });
      await writeFile(
        `artifacts/effect-handoff/${fixture.backend}.json`,
        JSON.stringify({ before, frozen, during, changed }, null, 2),
      );
      expect(frozen.revision).toBe(before.revision + 1);
      expect(frozen.effect.time).toBeGreaterThan(0.15);
      expect(during).toEqual(frozen);
      expect(changed.revision).toBe(frozen.revision + 1);
      expect(changed.effect.settings!.centerX).toBe(0.51);
      expect(changed.effect.time).toBe(frozen.effect.time);
      await page.evaluate(() => window.musart!.undo());
      expect((await snapshot()).effect).toEqual(frozen.effect);
      await page.evaluate(() => window.musart!.undo());
      expect((await snapshot()).effect.time).toBe(0);
      expect(fixture.errors).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
