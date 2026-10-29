import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";

/** Native dispatch through two useful RAFs; independent of transport and React render duration. */
async function observeOpening(page: Page, event: "click" | "pointerdown", selector: string) {
  await page.evaluate(
    ({ event, selector }) => {
      delete document.documentElement.dataset.controlOpening;
      document.addEventListener(
        event,
        (input) => {
          const dispatchedAt = performance.now();
          const counters = () =>
            Object.fromEntries(
              [".musart-app", ".inspector", ".canvas-area", ".editor-canvas"].map((selector) => [
                selector,
                Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders ?? 0),
              ]),
            );
          const before = counters();
          let raf = 0,
            stopped = false;
          const timeout = window.setTimeout(
            () => finish({ error: "No useful control frame in 3000 ms" }),
            3000,
          );
          const observer = new MutationObserver(check);
          function finish(result: object) {
            stopped = true;
            clearTimeout(timeout);
            cancelAnimationFrame(raf);
            observer.disconnect();
            document.documentElement.dataset.controlOpening = JSON.stringify(result);
          }
          function check() {
            if (stopped || raf) return;
            raf = requestAnimationFrame(() => {
              raf = 0;
              const node = document.querySelector<HTMLElement>(selector);
              const rect = node?.getBoundingClientRect();
              if (
                !node ||
                !rect?.width ||
                !rect.height ||
                Number(getComputedStyle(node).opacity) === 0 ||
                (selector === '[role="listbox"]' && !node.contains(document.activeElement))
              ) {
                check();
                return;
              }
              raf = requestAnimationFrame(() => {
                const after = counters();
                finish({
                  generatedAt: input.timeStamp,
                  dispatchedAt,
                  dispatchToPresentationOpportunityMs: performance.now() - dispatchedAt,
                  inputDelayMs: dispatchedAt - input.timeStamp,
                  renders: Object.fromEntries(
                    Object.keys(before).map((key) => [key, after[key]! - before[key]!]),
                  ),
                });
              });
            });
          }
          observer.observe(document.body, { childList: true, subtree: true });
          check();
        },
        { once: true, capture: true },
      );
    },
    { event, selector },
  );
}

async function opening(page: Page) {
  await page.waitForFunction(() => Boolean(document.documentElement.dataset.controlOpening));
  const result = await page.evaluate(() =>
    JSON.parse(document.documentElement.dataset.controlOpening!),
  );
  expect(result.error ?? null).toBeNull();
  return result;
}

test("Receipt selectors remain local, fit the viewport and preserve keyboard, cancellation and undo", async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  const fixture = await photographicEffect(page, "receipt", false);
  try {
    const projectId = await fixture.load({ id: "receipt-selector" });
    const trigger = page.locator('[data-attachment-effect-id="receipt-selector"]');
    await expect(trigger.locator("img")).toBeVisible();
    await trigger.locator("img").evaluate((image: HTMLImageElement) => image.decode());
    const inspector = page.locator(".inspector");
    const inspectorRenders = await inspector.getAttribute("data-react-renders");
    await observeOpening(page, "click", '.layer-attachment-popover[data-state="open"]');
    await trigger.click();
    const popupOpening = await opening(page);
    const popup = page.locator('.layer-attachment-popover[data-state="open"]');
    const mode = popup.getByRole("combobox", { name: "Trame thermique", exact: true });
    const original = await page.evaluate(() => {
      const state = window.musart!.snapshot();
      return { revision: state.revision, effect: state.project.pages[0]!.layers[0]!.effects[0]! };
    });
    const samples = [];
    for (let index = 0; index < 3; index++) {
      await observeOpening(page, "pointerdown", '[role="listbox"]');
      await mode.click();
      samples.push(await opening(page));
      const list = page.getByRole("listbox");
      await expect(
        list.getByRole("option", { name: "Points ordonnés", exact: true }),
      ).toBeVisible();
      expect(
        await list.evaluate((node) => !!node.closest("[data-radix-popper-content-wrapper]")),
      ).toBe(false);
      const bounds = (await list.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
      await page.keyboard.press("Escape");
      await expect(list).toHaveCount(0);
      await expect(mode).toBeFocused();
      await expect(popup).toBeVisible();
    }
    const environment = await page.evaluate(async () => {
      const info = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : null;
      return {
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        backend: document.querySelector(".editor-gpu-scene canvas")?.getAttribute("data-backend"),
        adapter: info
          ? {
              vendor: info.vendor,
              architecture: info.architecture,
              isFallbackAdapter: info.isFallbackAdapter,
            }
          : null,
      };
    });
    await mkdir("artifacts/effect-popover", { recursive: true });
    await writeFile(
      `artifacts/effect-popover/${process.env.MUSART_POPOVER_COHORT ?? "candidate"}-select.json`,
      JSON.stringify({ browser: browser.version(), environment, popupOpening, samples }, null, 2),
    );
    // Select dismissal never rebuilds the Inspector behind the still-open effect editor.
    await expect(inspector).toHaveAttribute("data-react-renders", inspectorRenders!);
    await expect(page.locator(".inspector-selection-boundary")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(original.revision);
    await mode.press("ArrowDown");
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("option", { name: "Points ordonnés", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("option", { name: "Points aléatoires", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(mode).toHaveText("Points aléatoires");
    await fixture.ready(projectId);
    const changed = await page.evaluate(() => {
      const state = window.musart!.snapshot();
      return { revision: state.revision, effect: state.project.pages[0]!.layers[0]!.effects[0]! };
    });
    expect(changed.revision).toBe(original.revision + 1);
    expect(changed.effect.settings!.mode).toBe("stochastic");
    await page.evaluate(() => window.musart!.undo());
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]),
    ).toEqual(original.effect);
    // A long blending menu still scrolls and fits a shorter native viewport.
    await page.setViewportSize({ width: 1000, height: 700 });
    await popup.getByRole("combobox", { name: "Fusion", exact: true }).click();
    const blend = page.getByRole("listbox");
    const bounds = (await blend.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(701);
    await blend.getByRole("option").last().scrollIntoViewIfNeeded();
    await expect(blend.getByRole("option").last()).toBeVisible();
    await page.screenshot({ path: "artifacts/effect-popover/receipt-select-aligned.png" });
    await page.keyboard.press("Escape");
    await expect(blend).toHaveCount(0);
    await expect(popup.getByRole("combobox", { name: "Fusion", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(page.locator(".inspector-selection-boundary")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(inspector).toHaveAttribute("data-selected-layer-id", "receipt-image");
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(fixture.errors).toEqual([]);
    for (const sample of [popupOpening, ...samples])
      expect(sample.renders).toEqual({
        ".musart-app": 0,
        ".inspector": 0,
        ".canvas-area": 0,
        ".editor-canvas": 0,
      });
    if (!process.env.MUSART_POPOVER_BASELINE)
      for (const sample of samples)
        expect(sample.dispatchToPresentationOpportunityMs).toBeLessThan(150);
  } finally {
    await fixture.close();
  }
});
