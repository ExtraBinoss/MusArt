import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import type {} from "../../apps/web/src/services/automation/automation";
import { mkdir, writeFile } from "node:fs/promises";

for (const mac of [false, true])
  test(`stable running clock, playback keycaps and named layer effects on ${mac ? "Mac bindings" : "Ctrl bindings"}`, async ({
    page,
  }) => {
    await page.addInitScript((mac) => {
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
      localStorage.setItem("musart.language", "en");
      Object.defineProperty(navigator, "platform", { value: mac ? "MacIntel" : "Linux x86_64" });
    }, mac);
    await page.goto("/?automation=1");
    await page.waitForFunction(() => !!window.musart);
    const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            width: 200,
            height: 200,
            layers: [
              createLayer("rectangle", {
                id: "clock-card",
                name: "Clock card",
                x: 40,
                y: 40,
                width: 80,
                height: 80,
                effects: [createEffect("blur", { amount: 0.1 }), createEffect("shadow")],
              }),
            ],
          }),
        ],
      }),
    );
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    engine.execute({ type: "setMotionDuration", duration: { value: 20, rate: 1 } });
    await page.evaluate((project) => {
      window.musart!.load(project);
      window.musart!.select(["clock-card"]);
    }, engine.getSnapshot().project);
    const canvas = page.locator(".editor-canvas");
    await canvas.focus();
    const chord = mac ? "Meta+Space" : "Control+Space";
    await page.keyboard.press(chord);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await expect(canvas).not.toHaveCSS("cursor", "grab");
    const samples = await page.evaluate(async () => {
      const counter = document.querySelector<HTMLElement>(".motion-time-counter")!,
        display = counter.querySelector<HTMLElement>(".motion-time-counter-display")!,
        input = counter.querySelector("input")!,
        timeline = document.querySelector<HTMLElement>(".motion-timeline")!;
      const result: {
        width: number;
        x: number;
        text: string;
        exact: string;
        commits: string | undefined;
      }[] = [];
      for (let index = 0; index < 45; index++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const box = counter.getBoundingClientRect();
        result.push({
          width: box.width,
          x: box.x,
          text: display.textContent!,
          exact: input.value,
          commits: timeline.dataset.reactRenders,
        });
      }
      return result;
    });
    expect(new Set(samples.map((sample) => sample.width)).size).toBe(1);
    expect(new Set(samples.map((sample) => sample.x)).size).toBe(1);
    expect(new Set(samples.map((sample) => sample.commits)).size).toBe(1);
    expect(new Set(samples.map((sample) => sample.text)).size).toBeGreaterThan(10);
    for (const sample of samples)
      expect(sample.text).toBe(String(Math.round(Number(sample.exact))));
    await canvas.focus();
    await page.keyboard.press(chord);
    const play = page.getByRole("button", { name: "Play", exact: true });
    await expect(play).toBeVisible();
    await play.hover();
    const keys = page.getByRole("tooltip").locator("kbd[data-slot=kbd]");
    await expect(keys).toHaveText([mac ? "⌘" : "Ctrl", "Space"]);
    await page.mouse.move(100, 150);
    await expect(page.locator(".motion-timeline-dock")).toHaveAttribute(
      "data-motion-expanded",
      "false",
    );
    const blur = page.locator('.layers-panel [data-attachment-tooltip="Blur"]').first();
    await blur.hover();
    await expect(page.getByRole("tooltip", { name: "Blur", exact: true })).toBeVisible();
    const shadow = page.locator('.layers-panel [data-attachment-tooltip="Drop shadow"]').first();
    await shadow.hover();
    await expect(page.getByRole("tooltip", { name: "Drop shadow", exact: true })).toBeVisible();
    await shadow.click();
    await expect(page.locator(".layer-attachment-popover")).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.keyboard.press("Escape");
    const field = page.getByRole("spinbutton", { name: "Current time", exact: true });
    await field.fill("1234.567");
    await page.keyboard.press(chord);
    await expect(play).toBeVisible();
    await field.press("Enter");
    expect(await field.inputValue()).toBe("1234.567");
    await mkdir("artifacts/timeline-clock", { recursive: true });
    await writeFile(
      `artifacts/timeline-clock/${mac ? "mac" : "ctrl"}.json`,
      JSON.stringify(samples, null, 2),
    );
    await page.screenshot({ path: `artifacts/timeline-clock/${mac ? "mac" : "ctrl"}.png` });
  });
