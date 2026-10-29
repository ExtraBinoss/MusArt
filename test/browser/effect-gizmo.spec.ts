import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";
import { densityEnvironment } from "./support/effect-density";
import { nativeWebGLFrame } from "./support/webgl-frame-snapshot";

const selectors = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
for (const forceWebGL of [false, true])
  test(`Radial effect handles and live phase use one transaction and freeze before export (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const d = await photographicEffect(page, "ripple", forceWebGL);
    const snapshot = () =>
      page.evaluate(() => {
        const state = window.musart!.snapshot();
        return { revision: state.revision, effect: state.project.pages[0]!.layers[0]!.effects[0]! };
      });
    const commits = () =>
      page.evaluate(
        (selectors) =>
          selectors.map((selector) =>
            Number(document.querySelector(selector)?.getAttribute("data-react-renders") ?? 0),
          ),
        selectors,
      );
    try {
      const id = await d.load({
        time: 0,
        settings: { centerX: 0.5, centerY: 0.5, innerRadius: 24, radius: 80, feather: 8 },
      });
      await page.evaluate(() => window.musart!.select(["ripple-image"]));
      const initial = await snapshot();
      const open = async () => {
        await page
          .locator(
            `.layer-row[data-layer-id="ripple-image"] [data-attachment-effect-id="${initial.effect.id}"]`,
          )
          .click();
        await expect(page.getByRole("button", { name: /^(Animer|Play live)$/ })).toBeVisible();
        await page.locator(".layer-attachment-popover").evaluate(async (element) => {
          await Promise.all(
            element
              .getAnimations({ subtree: true })
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => undefined)),
          );
        });
      };
      await open();
      const beforePlay = await commits();
      await page.getByRole("button", { name: /^(Animer|Play live)$/ }).click();
      await page.waitForFunction(
        () =>
          Number.parseFloat(document.querySelector(".effect-playback output")?.textContent ?? "0") >
          0.15,
      );
      const liveCommits = await commits();
      expect(liveCommits).toEqual(beforePlay);
      expect(await snapshot()).toEqual(initial);
      await page.getByRole("button", { name: /^(Pause|Pause live)$/ }).click();
      const paused = await snapshot();
      expect(paused.revision).toBe(initial.revision + 1);
      expect(paused.effect.time).toBeGreaterThan(0.15);
      await page.evaluate(() => window.musart!.undo());
      expect((await snapshot()).effect.time).toBe(0);
      await page.evaluate(() => window.musart!.redo());
      expect((await snapshot()).effect.time).toBe(paused.effect.time);
      await page.getByRole("button", { name: /^(Animer|Play live)$/ }).click();
      await page.waitForFunction(
        (time) =>
          Number.parseFloat(document.querySelector(".effect-playback output")?.textContent ?? "0") >
          time + 0.1,
        paused.effect.time!,
      );
      await page.locator(".export-trigger").click();
      await expect(page.locator(".export-popover")).toBeVisible();
      const frozen = await snapshot();
      expect(frozen.effect.time).toBeGreaterThan(paused.effect.time!);
      await page.keyboard.press("Escape");
      await expect(page.locator(".export-popover")).toHaveCount(0);
      await expect(page.locator(".export-trigger")).toBeFocused();
      await d.ready(id);
      const exported = await d.png();
      const live = forceWebGL
        ? (await nativeWebGLFrame(page, id)).dataUrl
        : await page
            .locator(".editor-gpu-scene canvas")
            .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
      expect((await d.compare(exported, live)).differentBytes).toBe(0);
      await d.save("live-frozen-phase", live);
      await open();
      await page.getByRole("button", { name: /^(Animer|Play live)$/ }).click();
      await page.waitForFunction(
        (time) =>
          Number.parseFloat(document.querySelector(".effect-playback output")?.textContent ?? "0") >
          time + 0.1,
        frozen.effect.time!,
      );
      const center = page.getByRole("button", { name: /^(Centre de l’effet|Effect center)$/ });
      const box = (await center.boundingBox())!;
      const beforeDrag = await snapshot();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const dragOrigin = await snapshot(),
        dragCommits = await commits();
      expect(dragOrigin.effect.time).toBeGreaterThan(beforeDrag.effect.time!);
      await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 12, { steps: 8 });
      expect(await snapshot()).toEqual(dragOrigin);
      expect(await commits()).toEqual(dragCommits);
      await page.mouse.up();
      const moved = await snapshot();
      expect(moved.revision).toBe(dragOrigin.revision + 1);
      expect(moved.effect.time).toBe(dragOrigin.effect.time);
      expect(Number(moved.effect.settings!.centerX)).toBeCloseTo(0.5 + 24 / 192, 3);
      expect(Number(moved.effect.settings!.centerY)).toBeCloseTo(0.5 + 12 / 192, 3);
      await page.evaluate(() => window.musart!.undo());
      expect((await snapshot()).effect).toEqual(dragOrigin.effect);
      const restored = (await center.boundingBox())!;
      await page.mouse.move(restored.x + restored.width / 2, restored.y + restored.height / 2);
      await page.mouse.down();
      await page.mouse.move(restored.x + 40, restored.y + 20);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      expect((await snapshot()).effect).toEqual(dragOrigin.effect);
      await center.focus();
      const keyOrigin = await snapshot();
      for (let i = 0; i < 5; i++) await page.keyboard.down("ArrowRight");
      expect(await snapshot()).toEqual(keyOrigin);
      await page.keyboard.up("ArrowRight");
      const nudged = await snapshot();
      expect(nudged.revision).toBe(keyOrigin.revision + 1);
      expect(Number(nudged.effect.settings!.centerX)).toBeCloseTo(0.5 + 5 / 192, 3);
      await page.evaluate(() => window.musart!.undo());
      expect((await snapshot()).effect).toEqual(keyOrigin.effect);
      await page.screenshot({ path: `artifacts/ripple/${d.backend}-handles.png` });
      const environment = await densityEnvironment(page);
      expect(environment.reads.gpu + environment.reads.webgl + environment.reads.canvas).toBe(0);
      expect(d.errors).toEqual([]);
      await writeFile(
        `artifacts/ripple/${d.backend}-interaction.json`,
        JSON.stringify(
          {
            beforePlay,
            liveCommits,
            initial,
            paused,
            frozen,
            dragOrigin,
            moved,
            nudged,
            environment,
            errors: d.errors,
          },
          null,
          2,
        ),
      );
    } finally {
      await d.close();
    }
  });
