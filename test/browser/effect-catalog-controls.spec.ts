import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  EFFECT_CATALOG,
  getEffectDefinition,
  getEffectParameter,
  isEffectParameterVisible,
  type EffectType,
} from "@musart/core";
import { photographicEffect } from "./support/photographic-effect";
import { effectControlCases, parameterKey } from "./support/effect-control-catalog";
import {
  measureControl,
  revealEffectField,
  stableEffectSelection,
  type ControlSample,
} from "./support/effect-control-input";
import { exerciseEffectComposition } from "./support/effect-composition-controls";

for (const type of Object.values(EFFECT_CATALOG)
  .filter((effect) => !effect.source)
  .map((effect) => effect.type) as EffectType[]) {
  test(`${type}: every parameter preserves selection, preview cancellation and one-edit undo`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
    const fixture = await photographicEffect(page, type, false);
    const definition = getEffectDefinition(type),
      layerId = `${type}-image`;
    const samples: ControlSample[] = [],
      covered = new Set<string>();
    let openingMs = 0;
    let compositionChecked = false,
      numericCancellationChecked = false,
      colorCancellationChecked = false;
    try {
      for (const scenario of effectControlCases(type)) {
        const projectId = await fixture.load(scenario.effect);
        await page.evaluate((id) => window.musart!.select([id]), layerId);
        await expect(page.locator(".inspector")).toHaveAttribute("data-selected-layer-id", layerId);
        const trigger = page.locator(`[data-attachment-effect-id="${scenario.effect.id}"]`);
        await expect(trigger.locator("img")).toBeVisible();
        await trigger.locator("img").evaluate((image: HTMLImageElement) => image.decode());
        const popup = page.locator('.layer-attachment-popover[data-state="open"]');
        const opening = await measureControl(
          page,
          "open",
          "click",
          () => trigger.click(),
          '.layer-attachment-popover[data-state="open"]',
        );
        await expect(popup).toBeVisible();
        openingMs = Math.max(openingMs, opening.dispatchToPresentationMs);
        await stableEffectSelection(page, layerId);
        if (!compositionChecked) {
          samples.push(
            ...(await exerciseEffectComposition(page, popup, layerId, () =>
              fixture.ready(projectId),
            )),
          );
          compositionChecked = true;
        }
        const visible = definition.parameters.filter((parameter) =>
          isEffectParameterVisible(scenario.effect, parameter),
        );
        for (const parameter of scenario.fields) {
          const field = await revealEffectField(page, popup, visible.indexOf(parameter));
          const before = await page.evaluate(() => {
            const snapshot = window.musart!.snapshot();
            return {
              revision: snapshot.revision,
              effect: snapshot.project.pages[0]!.layers[0]!.effects[0]!,
            };
          });
          const value = getEffectParameter(before.effect, parameter);
          let revision = before.revision;
          const read = () =>
            page.evaluate(() => {
              const snapshot = window.musart!.snapshot();
              return {
                revision: snapshot.revision,
                effect: snapshot.project.pages[0]!.layers[0]!.effects[0]!,
              };
            });
          const undo = async () => {
            expect((await read()).revision).toBe(revision + 1);
            await stableEffectSelection(page, layerId);
            await fixture.ready(projectId);
            await page.evaluate(() => window.musart!.undo());
            expect((await read()).effect).toEqual(before.effect);
            expect((await read()).revision).toBe(revision + 2);
            revision += 2;
            expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
          };
          if (parameter.kind === "number") {
            let input = field.getByRole("textbox");
            const next =
              Number(value) + parameter.step <= parameter.max
                ? Number(value) + parameter.step
                : Number(value) - parameter.step;
            const display = String(Number((next * parameter.displayScale).toFixed(8)));
            await input.focus();
            samples.push(
              await measureControl(page, `${parameter.key}:preview`, "input", () =>
                input.fill(display),
              ),
            );
            expect(await read()).toEqual(before);
            await stableEffectSelection(page, layerId);
            if (!numericCancellationChecked) {
              await input.press("Escape");
              await expect(popup).toHaveCount(0);
              expect(await read()).toEqual(before);
              expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual([
                layerId,
              ]);
              await trigger.click();
              input = (await revealEffectField(page, popup, visible.indexOf(parameter))).getByRole(
                "textbox",
              );
              await input.fill(display);
              numericCancellationChecked = true;
            }
            // Blur commits; Escape remains owned by the enclosing popover's dismissal contract.
            await input.press("Enter");
            expect(getEffectParameter((await read()).effect, parameter)).toBeCloseTo(next, 6);
            await undo();
          } else if (parameter.kind === "boolean") {
            const button = field.getByRole("switch");
            samples.push(await measureControl(page, parameter.key, "click", () => button.click()));
            expect(getEffectParameter((await read()).effect, parameter)).toBe(!value);
            await undo();
          } else if (parameter.kind === "select") {
            const trigger = field.getByRole("combobox");
            for (const [index, option] of parameter.options.entries()) {
              samples.push(
                await measureControl(
                  page,
                  `${parameter.key}:open`,
                  "pointerdown",
                  () => trigger.click(),
                  '[role="listbox"]',
                ),
              );
              await expect(page.getByRole("listbox")).toBeVisible();
              await stableEffectSelection(page, layerId);
              expect(await read()).toEqual({ ...before, revision });
              if (option.value === value) {
                await page.keyboard.press("Escape");
                await expect(page.getByRole("listbox")).toHaveCount(0);
                await expect(trigger).toBeFocused();
                continue;
              }
              const choice = page.getByRole("option").nth(index);
              await choice.scrollIntoViewIfNeeded();
              await choice.click();
              await expect(page.getByRole("listbox")).toHaveCount(0);
              expect(getEffectParameter((await read()).effect, parameter)).toBe(option.value);
              await undo();
            }
          } else {
            const button = field.locator('[data-slot="popover-trigger"]');
            samples.push(
              await measureControl(
                page,
                `${parameter.key}:open`,
                "click",
                () => button.click(),
                '.effect-color-popover[data-state="open"]',
              ),
            );
            const picker = page.locator('.effect-color-popover[data-state="open"]');
            await expect(picker).toBeVisible();
            await stableEffectSelection(page, layerId);
            const input = picker.getByRole("textbox");
            const next = value === "#12ab34" ? "#ab3412" : "#12ab34";
            samples.push(
              await measureControl(page, `${parameter.key}:preview`, "input", () =>
                input.fill(next),
              ),
            );
            expect(await read()).toEqual(before);
            if (!colorCancellationChecked) {
              await page.keyboard.press("Escape");
              await expect(picker).toHaveCount(0);
              expect(await read()).toEqual(before);
              await stableEffectSelection(page, layerId);
              await button.click();
              await expect(picker).toBeVisible();
              await picker.getByRole("textbox").fill(next);
              colorCancellationChecked = true;
            }
            await input.press("Enter");
            expect(getEffectParameter((await read()).effect, parameter)).toBe(next);
            await page.keyboard.press("Escape");
            await expect(picker).toHaveCount(0);
            await undo();
          }
          covered.add(parameterKey(parameter));
          await stableEffectSelection(page, layerId);
        }
        await page.keyboard.press("Escape");
        await expect(popup).toHaveCount(0);
      }
      expect([...covered].sort()).toEqual(definition.parameters.map(parameterKey).sort());
      expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      expect(fixture.errors).toEqual([]);
      const info = await page.evaluate(async () => {
        const adapter = (await navigator.gpu?.requestAdapter())?.info;
        return {
          userAgent: navigator.userAgent,
          viewport: [innerWidth, innerHeight],
          dpr: devicePixelRatio,
          backend: document.querySelector(".editor-gpu-scene canvas")?.getAttribute("data-backend"),
          adapter: adapter
            ? {
                vendor: adapter.vendor,
                architecture: adapter.architecture,
                isFallbackAdapter: adapter.isFallbackAdapter,
              }
            : null,
        };
      });
      await mkdir("artifacts/effect-controls-catalog", { recursive: true });
      await writeFile(
        `artifacts/effect-controls-catalog/${process.env.MUSART_POPOVER_COHORT ?? "candidate"}-${type}.json`,
        JSON.stringify(
          {
            type,
            browser: browser.version(),
            environment: info,
            openingMs,
            covered: [...covered],
            samples,
            diagnosticBudget: {
              targetMs: 150,
              openingExceeded: openingMs >= 150,
              exceeded: samples.filter((sample) => sample.dispatchToPresentationMs >= 150),
            },
          },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          type,
          fields: covered.size,
          openingMs,
          slowestMs: Math.max(...samples.map((sample) => sample.dispatchToPresentationMs)),
        }),
      );
      for (const sample of samples)
        expect(sample.renders).toEqual({
          ".musart-app": 0,
          ".inspector": 0,
          ".canvas-area": 0,
          ".editor-canvas": 0,
          ".editor-gpu-scene": 0,
        });
      // Timing gates require an explicitly chosen native environment; correctness is portable.
      // Always retain cold samples and the diagnostic 150 ms failures in the report above.
      if (process.env.MUSART_EFFECT_CONTROL_BUDGET_MS) {
        const budget = Number(process.env.MUSART_EFFECT_CONTROL_BUDGET_MS);
        expect(Number.isFinite(budget) && budget > 0).toBe(true);
        expect(openingMs).toBeLessThan(budget);
        for (const sample of samples) expect(sample.dispatchToPresentationMs).toBeLessThan(budget);
      }
    } finally {
      await fixture.close();
    }
  });
}
