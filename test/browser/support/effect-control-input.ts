import { expect, type Locator, type Page } from "@playwright/test";

const surfaces = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
export interface ControlSample {
  action: string;
  inputDelayMs: number;
  dispatchToPresentationMs: number;
  renders: Record<string, number>;
}

export async function measureControl(
  page: Page,
  action: string,
  event: "click" | "input" | "keydown" | "pointerdown",
  input: () => Promise<unknown>,
  ready?: string,
) {
  await page.evaluate(
    ({ event, surfaces, ready }) => {
      delete document.documentElement.dataset.effectControlSample;
      const read = () =>
        Object.fromEntries(
          surfaces.map((selector) => {
            const value = Number(
              document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
            );
            if (!Number.isSafeInteger(value) || value < 1)
              throw new Error(`Missing actual React commit counter: ${selector}`);
            return [selector, value];
          }),
        );
      read();
      document.addEventListener(
        event,
        (input) => {
          const start = performance.now();
          const before = read();
          let stopped = false,
            raf = 0;
          const finish = (value: object) => {
            stopped = true;
            clearTimeout(timeout);
            cancelAnimationFrame(raf);
            document.documentElement.dataset.effectControlSample = JSON.stringify(value);
          };
          const timeout = setTimeout(() => {
            finish({
              error: "No useful control frame in 3000 ms",
            });
          }, 3000);
          function check() {
            if (stopped) return;
            const node = ready ? document.querySelector<HTMLElement>(ready) : null;
            if (
              ready &&
              (!node ||
                !node.getBoundingClientRect().width ||
                Number(getComputedStyle(node).opacity) === 0 ||
                (node.getAttribute("role") === "listbox" && !node.contains(document.activeElement)))
            ) {
              raf = requestAnimationFrame(check);
              return;
            }
            raf = requestAnimationFrame(() => {
              const after = read();
              finish({
                inputDelayMs: start - input.timeStamp,
                dispatchToPresentationMs: performance.now() - start,
                renders: Object.fromEntries(
                  surfaces.map((selector) => [selector, after[selector]! - before[selector]!]),
                ),
              });
            });
          }
          raf = requestAnimationFrame(check);
        },
        { once: true, capture: true },
      );
    },
    { event, surfaces, ready },
  );
  await input();
  await page.waitForFunction(() => Boolean(document.documentElement.dataset.effectControlSample));
  const sample = await page.evaluate(() =>
    JSON.parse(document.documentElement.dataset.effectControlSample!),
  );
  expect(sample.error ?? null).toBeNull();
  return { action, ...sample } as ControlSample;
}

/** Scroll the real viewport; offscreen virtual controls do not exist until their window is reached. */
export async function revealEffectField(page: Page, popup: Locator, index: number) {
  const field = popup.locator(`[data-parameter-index="${index}"]`);
  const viewport = popup.locator(".layer-attachment-viewport");
  if (await field.isVisible()) {
    await field.scrollIntoViewIfNeeded();
    return field;
  }
  await viewport.evaluate((node) => {
    node.scrollTop = 0;
  });
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await field.isVisible()) {
      await field.scrollIntoViewIfNeeded();
      return field;
    }
    await viewport.evaluate((node) => {
      node.scrollTop += node.clientHeight * 0.6;
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
  throw new Error(`Parameter ${index} never entered the native scroll viewport`);
}

export async function stableEffectSelection(page: Page, layerId: string) {
  expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual([layerId]);
  await expect(page.locator(".inspector")).toHaveAttribute("data-selected-layer-id", layerId);
  await expect(page.locator('.layer-attachment-popover[data-state="open"]')).toHaveCount(1);
}
