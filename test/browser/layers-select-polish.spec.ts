import { expect, test, type Locator, type Page } from "@playwright/test";
import { BLEND_MODES, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

const capturePath = "artifacts/motion/ui";
const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
const fixture = () =>
  createProject({
    name: "Layers and select interface",
    pages: [
      createPage({
        id: "layers-select-board",
        name: "Botanical study",
        width: 840,
        height: 600,
        background: "#17231c",
        layers: [
          createLayer("rectangle", {
            id: "paper",
            name: "Warm paper",
            x: 80,
            y: 70,
            width: 680,
            height: 460,
            radius: 28,
            fill: "#e5e8c2",
          }),
          createLayer("ellipse", {
            id: "disc",
            name: "Coral sun",
            x: 335,
            y: 120,
            width: 280,
            height: 280,
            fill: "#df866b",
          }),
          createLayer("rectangle", {
            id: "foreground",
            name: "Botanical card",
            x: 160,
            y: 290,
            width: 330,
            height: 170,
            radius: 24,
            fill: "#6e865d",
          }),
        ],
      }),
    ],
  });

async function twoFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function canonical(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
        return (
          canvas?.dataset.rendererReady === "true" &&
          Number(canvas.dataset.canonicalRevision) === window.musart!.snapshot().revision
        );
      }),
    )
    .toBe(true);
  await twoFrames(page);
}
async function counters(page: Page) {
  const result = await page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => [
          selector,
          Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
        ]),
      ),
    roots,
  );
  for (const value of Object.values(result)) expect(Number.isFinite(value)).toBe(true);
  return result;
}
async function settled(content: Locator) {
  await expect
    .poll(() =>
      content.evaluate((node) =>
        node
          .getAnimations()
          .every(
            (animation) => animation.playState === "finished" || animation.playState === "idle",
          ),
      ),
    )
    .toBe(true);
}
async function fixedHeight(content: Locator, height: number) {
  expect(Math.abs((await content.boundingBox())!.height - height)).toBeLessThanOrEqual(1);
}

async function prepare(page: Page, colorScheme: "dark" | "light") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.emulateMedia({ colorScheme });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    // Use the real OS-theme listener for both captures, without editing application state from a test.
    localStorage.setItem("musart.theme", "system");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["foreground"]);
  }, fixture());
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  await canonical(page);
  await mkdir(capturePath, { recursive: true });

  return errors;
}

test("native Layers chrome and select scrolling keep their controls, owner and fixed menu geometry", async ({
  page,
  browser,
}) => {
  const errors = await prepare(page, "dark");
  const layers = page.locator(".layers-panel");
  const header = layers.locator(":scope > .panel-heading");
  const appearance = layers.locator(":scope > .layer-compositing");
  await expect(header).toHaveCSS("height", "36px");
  await expect(appearance).toBeVisible();
  await expect(appearance).toHaveCSS("height", "32px");
  await expect(layers.locator(":scope > .layers-footer")).toHaveCount(0);
  await expect(header.locator(".icon-button")).toHaveCount(2);
  for (const button of await header.locator(".icon-button").all()) {
    await expect(button).toHaveCSS("width", "30px");
    await expect(button).toHaveCSS("height", "30px");
  }
  const opacity = appearance.getByRole("textbox", { name: "Opacité", exact: true });
  await expect(opacity).toHaveValue("100");
  expect((await opacity.boundingBox())!.width).toBeGreaterThanOrEqual(28);

  await header.getByRole("button", { name: "Actions des calques", exact: true }).click();
  await page.getByRole("menuitem", { name: "Dupliquer la sélection", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(4);
  await page.evaluate(() => {
    window.musart!.undo();
    window.musart!.select(["foreground"]);
  });
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(3);
  await canonical(page);

  await header
    .getByRole("button", { name: "Ajouter un effet, réglage ou masque", exact: true })
    .click();
  const effects = page.getByRole("menuitem", { name: "Ajouter un effet", exact: true });
  const adjustments = page.getByRole("menuitem", { name: "Ajouter un réglage", exact: true });
  const quiet = await counters(page);
  const categories: { category: string; side: string | null }[] = [];
  for (const category of ["effect", "adjustment", "effect", "adjustment", "effect"]) {
    const trigger = category === "effect" ? effects : adjustments;
    const other = category === "effect" ? adjustments : effects;
    const box = (await trigger.boundingBox())!;
    // Moving between sibling rows at the same X exercises the old diagonal-grace failure.
    await page.mouse.move(box.x + 24, box.y + box.height / 2, { steps: 4 });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAttribute("data-highlighted", "");
    await expect(other).toHaveAttribute("aria-expanded", "false");
    const submenu = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]');
    await expect(submenu).toHaveCount(1);
    expect(
      await submenu.evaluate(
        (node) => !!node.parentElement?.closest('[data-slot="dropdown-menu-content"]'),
      ),
    ).toBe(false);
    categories.push({ category, side: await submenu.getAttribute("data-side") });
  }
  expect(await counters(page)).toEqual(quiet);
  const beforeEffect = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.getByRole("menuitem", { name: "Dither", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.find((layer) => layer.id === "foreground")!
          .effects.map((effect) => effect.type),
      ),
    )
    .toEqual(["dither"]);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(beforeEffect + 1);
  expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual(["foreground"]);
  await canonical(page);

  const blend = appearance.locator('[data-slot="select-trigger"][aria-label="Fusion"]');
  const beforeSelect = await page.evaluate(() => window.musart!.snapshot().revision);
  await blend.click();
  const content = page.locator('[data-slot="select-content"][data-state="open"]');
  const viewport = content.locator('[data-slot="select-viewport"]');
  const shadow = content.locator(".select-scroll-shadow.scroll-shadow");
  await settled(content);
  const height = (await content.boundingBox())!.height;
  expect(height).toBeLessThanOrEqual(Math.min(360, page.viewportSize()!.height * 0.6) + 1);
  const scrollbars = await viewport.evaluate((node) => ({
    width: getComputedStyle(node).scrollbarWidth,
    color: getComputedStyle(node).scrollbarColor,
    webkitWidth: getComputedStyle(node, "::-webkit-scrollbar").width,
    webkitDisplay: getComputedStyle(node, "::-webkit-scrollbar").display,
    overflow: node.scrollHeight - node.clientHeight,
    standardWidth: getComputedStyle(document.querySelector(".layer-tree")!, "::-webkit-scrollbar")
      .width,
  }));
  expect(scrollbars.width).toBe("thin");
  expect(scrollbars.webkitDisplay).not.toBe("none");
  expect(scrollbars.webkitWidth).toBe(scrollbars.standardWidth);
  expect(scrollbars.overflow).toBeGreaterThan(30);
  await expect(shadow).toHaveAttribute("data-overflow-bottom", "");
  const scrollQuiet = await counters(page);
  const samples: { input: string; top: number; height: number }[] = [];
  const sample = async (input: string) => {
    await fixedHeight(content, height);
    samples.push({
      input,
      top: await viewport.evaluate((node) => node.scrollTop),
      height: (await content.boundingBox())!.height,
    });
  };
  const center = async () => {
    const bounds = (await viewport.boundingBox())!;
    await page.mouse.move(bounds.x + 24, bounds.y + bounds.height / 2);
  };
  const start = await viewport.evaluate((node) => node.scrollTop);
  await content.locator('[data-slot="select-scroll-down-button"]').hover();
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(start + 1);
  await center();
  await sample("Radix down control");
  const down = await viewport.evaluate((node) => node.scrollTop);
  await content.locator('[data-slot="select-scroll-up-button"]').hover();
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeLessThan(down - 1);
  await center();
  await sample("Radix up control");
  await page.mouse.wheel(0, 160);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
  await sample("native wheel");
  const wheel = await viewport.evaluate((node) => node.scrollTop);
  const bottom = (await viewport.boundingBox())!;
  await page.mouse.move(bottom.x + 24, bottom.y + bottom.height - 3);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(wheel + 1);
  await center();
  await sample("shadow edge hover");
  const gutter = (await viewport.boundingBox())!;
  await page.mouse.move(gutter.x + gutter.width - 2, gutter.y + gutter.height - 3);
  const gutterTop = await viewport.evaluate((node) => node.scrollTop);
  await twoFrames(page);
  expect(await viewport.evaluate((node) => node.scrollTop)).toBeCloseTo(gutterTop, 0);
  expect(
    await shadow.evaluate((node) => Number.parseFloat(getComputedStyle(node, "::after").right)),
  ).toBeGreaterThanOrEqual(6);
  expect(await counters(page)).toEqual(scrollQuiet);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(beforeSelect);

  await page.screenshot({ path: `${capturePath}/layers-select-dark.png` });
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(content).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window
            .musart!.snapshot()
            .project.pages[0]!.layers.find((layer) => layer.id === "foreground")!.blendMode,
      ),
    )
    .toBe(BLEND_MODES[1]);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(beforeSelect + 1);
  await page.evaluate(() => window.musart!.undo());
  await canonical(page);

  await page.screenshot({ path: `${capturePath}/layers-chrome-dark.png` });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await writeFile(
    `${capturePath}/layers-select-report.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        viewport: page.viewportSize(),
        categories,
        height,
        scrollbars,
        samples,
        errors,
      },
      null,
      2,
    ),
  );
});

test("light Layers and Select retain their neutral chrome and bounded scroll viewport", async ({
  page,
}) => {
  const errors = await prepare(page, "light");
  const layers = page.locator(".layers-panel");
  await expect(layers.locator(":scope > .layer-compositing")).toBeVisible();
  await page.screenshot({ path: `${capturePath}/layers-chrome-light.png` });
  await layers.locator('[data-slot="select-trigger"][aria-label="Fusion"]').click();
  const content = page.locator('[data-slot="select-content"][data-state="open"]');
  const viewport = content.locator('[data-slot="select-viewport"]');
  await settled(content);
  expect((await content.boundingBox())!.height).toBeLessThanOrEqual(360);
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 24, box.y + box.height / 2);
  await page.mouse.wheel(0, 140);
  await expect(content.locator(".select-scroll-shadow")).toHaveAttribute("data-overflow-top", "");
  await page.screenshot({ path: `${capturePath}/layers-select-light.png` });
  await page.keyboard.press("Escape");
  await expect(content).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
