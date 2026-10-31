import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

const surfaces = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
  ".motion-timeline",
] as const;
interface Opening {
  inputAt: number;
  dispatchAt: number;
  readyAt: number;
  presentedAt: number;
  commits: Record<string, number>;
}
interface InputSample {
  type: string;
  generatedAt: number;
  dispatchAt: number;
  button: number;
  detail: number;
}
declare global {
  interface Window {
    __layerMenuOpening?: Opening;
    __layerMenuInputs?: InputSample[];
  }
}
async function arm(page: Page, slot: string, event: "click" | "contextmenu" | "pointerdown") {
  await page.evaluate(
    ({ surfaces, slot, event }) => {
      const counts = () =>
        Object.fromEntries(
          surfaces.map((selector) => {
            const count = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
            if (!count || Number(count) < 1) throw Error(`Missing React counter: ${selector}`);
            return [selector, Number(count)];
          }),
        );
      const before = counts();
      delete window.__layerMenuOpening;
      document.addEventListener(
        event,
        (input) => {
          const dispatchAt = performance.now();
          const poll = () => {
            const content = document.querySelector<HTMLElement>(
              `[data-slot="${slot}"][data-state="open"]`,
            );
            if (
              !content ||
              !content.getBoundingClientRect().width ||
              getComputedStyle(content).opacity === "0"
            ) {
              requestAnimationFrame(poll);
              return;
            }
            const readyAt = performance.now();
            requestAnimationFrame(() => {
              const after = counts();
              window.__layerMenuOpening = {
                inputAt: input.timeStamp,
                dispatchAt,
                readyAt,
                presentedAt: performance.now(),
                commits: Object.fromEntries(
                  surfaces.map((selector) => [selector, after[selector]! - before[selector]!]),
                ),
              };
            });
          };
          requestAnimationFrame(poll);
        },
        { capture: true, once: true },
      );
    },
    { surfaces: [...surfaces], slot, event },
  );
}
async function opening(page: Page) {
  await page.waitForFunction(() => Boolean(window.__layerMenuOpening));
  return page.evaluate(() => window.__layerMenuOpening!);
}

test("Morph layer menus and effect popovers retain editor surfaces and rapid reopening stays single", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.addInitScript(() => {
    const inputs: InputSample[] = [];
    window.__layerMenuInputs = inputs;
    for (const type of ["pointerdown", "pointerup", "contextmenu", "click", "dblclick"]) {
      document.addEventListener(
        type,
        (event) => {
          const input = event as MouseEvent;
          inputs.push({
            type,
            generatedAt: input.timeStamp,
            dispatchAt: performance.now(),
            button: input.button,
            detail: input.detail,
          });
          if (inputs.length > 100) inputs.shift();
        },
        true,
      );
    }
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(async () => {
    const { project } = await (await fetch("/templates/motion/morphing-type.json")).json();
    window.musart!.load(project);
  });
  const row = page.locator('.layer-row[data-layer-id="morphing-title"] .layer-name');
  await expect(row).toBeVisible();
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
  });
  const original = await page.evaluate(() => {
    const snapshot = window.musart!.snapshot();
    return { revision: snapshot.revision, project: JSON.stringify(snapshot.project) };
  });
  const samples: Opening[] = [];
  for (let index = 0; index < 2; index++) {
    await arm(page, "context-menu-content", "contextmenu");
    await row.click({ button: "right" });
    samples.push(await opening(page));
    expect(
      await page.evaluate(
        () => window.__layerMenuInputs!.filter((event) => event.type === "contextmenu").length,
      ),
    ).toBe(index + 1);
    await expect(page.getByRole("menu")).toHaveCount(1);
    expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual([
      "morphing-title",
    ]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
  }
  // Real right-button release over a newly mounted item used to synthesize a
  // primary click in Radix, silently executing the action and closing the menu.
  await row.hover();
  await page.mouse.down({ button: "right" });
  const duplicate = page.getByRole("menuitem", { name: /^Dupliquer/ });
  await expect(duplicate).toBeVisible();
  await duplicate.hover();
  await page.mouse.up({ button: "right" });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.getByRole("menu").count()).toBe(1);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(original.revision);
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length)).toBe(
    1,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await row.click({ button: "right" });
  await row.click({ button: "right", force: true });
  await expect(page.getByRole("menu")).toHaveCount(1);
  await expect(page.locator(".layer-name-input")).toHaveCount(0);
  await page.getByRole("menuitem", { name: /^Dupliquer/ }).click();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(original.revision + 1);
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length)).toBe(
    2,
  );
  await page.evaluate(() => {
    window.musart!.undo();
    window.musart!.select(["morphing-title"]);
  });
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    original.project,
  );
  await expect(page.locator('.inspector[data-selected-layer-id="morphing-title"]')).toBeVisible();
  await arm(page, "popover-content", "click");
  await page
    .locator('.layer-row[data-layer-id="morphing-title"] [data-attachment-target="effect"]')
    .click();
  samples.push(await opening(page));
  await expect(page.locator(".layer-attachment-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
  const pointerEvents = await page.evaluate(() => document.body.style.pointerEvents);
  await arm(page, "dropdown-menu-content", "pointerdown");
  await page
    .locator(".layers-footer")
    .getByRole("button", { name: "Ajouter un effet, réglage ou masque", exact: true })
    .click();
  samples.push(await opening(page));
  expect(await page.evaluate(() => document.body.style.pointerEvents)).toBe(pointerEvents);
  await page.getByRole("menuitem", { name: "Ajouter un effet", exact: true }).hover();
  await expect(page.locator('[data-effect-category="effect"]')).toBeVisible();
  await page.getByRole("menuitem", { name: "Ajouter un réglage", exact: true }).hover();
  await expect(page.locator('[data-effect-category="adjustment"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    original.project,
  );
  const environment = await page.evaluate(async () => {
    const info = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : undefined;
    return {
      userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      adapter: info
        ? {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            isFallbackAdapter: info.isFallbackAdapter,
          }
        : null,
      backend: document.querySelector(".editor-gpu-scene canvas")?.getAttribute("data-backend"),
      readbacks: window.__musartVideoReadbacks,
    };
  });
  await mkdir("artifacts/layer-overlay-investigation", { recursive: true });
  await writeFile(
    `artifacts/layer-overlay-investigation/${process.env.MUSART_OVERLAY_COHORT ?? "candidate"}.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        environment,
        samples,
        errors,
        inputs: await page.evaluate(() => window.__layerMenuInputs),
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
  expect(environment.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
  for (const [index, sample] of samples.entries()) {
    for (const selector of surfaces) {
      // First selection may mount its actual Inspector; opening alone must retain it.
      if (index === 0 && selector === ".inspector")
        expect(sample.commits[selector]).toBeLessThanOrEqual(1);
      else expect(sample.commits[selector], selector).toBe(0);
    }
  }
});
