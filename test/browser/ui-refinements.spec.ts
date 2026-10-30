import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { writeFile } from "node:fs/promises";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function ready(page: Page) {
  await page.addInitScript(() => localStorage.setItem("musart.theme", "dark"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const project = createProject({
    pages: [
      createPage({
        width: 500,
        height: 500,
        background: "#e8ff00",
        layers: [
          createLayer("rectangle", {
            id: "reset-target",
            width: 200,
            height: 100,
            x: 35,
            opacity: 0.4,
            fill: "#e8ff00",
          }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["reset-target"]);
  }, project);
  await expect(page.locator(".inspector")).toHaveAttribute(
    "data-selected-layer-id",
    "reset-target",
  );
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
}
async function layer(page: Page) {
  return page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!);
}

test("scrub-label resets commit once, undo exactly, and narrow controls keep accessible labels", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await ready(page);
  const revision = await page.evaluate(() => window.musart!.snapshot().revision);
  const handle = page.getByRole("button", { name: "Ajuster X", exact: true });
  await handle.dblclick();
  expect((await layer(page)).x).toBe(0);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
  await handle.dblclick();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await page.keyboard.press("Control+z");
  expect((await layer(page)).x).toBe(35);
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  await page.getByRole("button", { name: "Ajuster Largeur", exact: true }).dblclick();
  expect((await layer(page)).width).toBe(280);
  await page.getByRole("button", { name: "Ajuster Opacité", exact: true }).dblclick();
  expect((await layer(page)).opacity).toBe(1);
  await expect(
    page.getByRole("group", { name: "Alignement horizontal", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Alignement vertical", exact: true })).toBeVisible();
  const resize = (await page.locator(".sidebar-resize").boundingBox())!;
  await page.mouse.move(resize.x + resize.width / 2, resize.y + 200);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 45, resize.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".position-field-label > span").first()).toHaveCSS("display", "none");
  await expect(page.getByRole("textbox", { name: "Largeur", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 650 });
  await page.getByRole("tab", { name: "Animation", exact: true }).click();
  const animate = page.getByRole("region", { name: "Rejouer la création", exact: true });
  await expect(animate).toBeVisible();
  await page.getByRole("button", { name: "Préparer le timelapse", exact: true }).click();
  const exportVideo = page.getByRole("button", { name: "Exporter la vidéo", exact: true });
  await exportVideo.scrollIntoViewIfNeeded();
  await expect(exportVideo).toBeInViewport();
  await exportVideo.click({ trial: true });
  expect(await animate.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: "artifacts/screenshots/animate-compact-short-panel.png" });
  expect(errors).toEqual([]);
});

test("spotlight reveals only bounded result rows over an opaque neutral surface and respects reduced motion", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await ready(page);
  const entrance = page.evaluate(
    () =>
      new Promise<{ opacity: number; filter: string }[]>((resolve, reject) => {
        const samples: { opacity: number; filter: string }[] = [];
        let frame = 0;
        const timer = setTimeout(() => {
          cancelAnimationFrame(frame);
          window.removeEventListener("keydown", start, true);
          reject(new Error("No native spotlight entrance"));
        }, 3000);
        function sample() {
          const surface = document.querySelector(".magic-search-surface"),
            row = document.querySelector(".magic-search-item-content");
          if (surface && row)
            samples.push({
              opacity: Number(getComputedStyle(surface).opacity),
              filter: getComputedStyle(row).filter,
            });
          if (samples.length < 20) frame = requestAnimationFrame(sample);
          else {
            clearTimeout(timer);
            resolve(samples);
          }
        }
        function start(event: KeyboardEvent) {
          if (event.key.toLowerCase() !== "k" || !event.ctrlKey) return;
          window.removeEventListener("keydown", start, true);
          frame = requestAnimationFrame(sample);
        }
        window.addEventListener("keydown", start, true);
        document.documentElement.dataset.refinementAnimationArmed = "true";
      }),
  );
  await page.waitForFunction(
    () => document.documentElement.dataset.refinementAnimationArmed === "true",
  );
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Rechercher dans Melt", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("background-color", "rgb(42, 42, 42)");
  expect(await dialog.getByRole("option").count()).toBeLessThanOrEqual(20);
  const capture = () =>
    page
      .locator(".musart-app,.inspector,.canvas-area,.editor-canvas")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.reactRenders));
  const before = await capture();
  await expect(dialog.locator(".magic-search-surface")).toHaveCSS("opacity", "1");
  await expect(dialog.locator(".magic-search-item-content").first()).toHaveCSS(
    "filter",
    "blur(0px)",
  );
  expect(await capture()).toEqual(before);
  const samples = await entrance;
  expect(samples.some((sample) => sample.opacity > 0 && sample.opacity < 1)).toBe(true);
  expect(samples.at(-1)?.opacity).toBe(1);
  expect(new Set(samples.map((sample) => sample.filter)).size).toBeGreaterThan(1);
  await writeFile("artifacts/ui-refinements-motion.json", JSON.stringify(samples, null, 2));
  await page.screenshot({ path: "artifacts/screenshots/spotlight-neutral-dark.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".magic-search-item-content").first()).toHaveCSS(
    "filter",
    "blur(0px)",
  );
  await page.getByRole("combobox", { name: "Rechercher dans Melt", exact: true }).fill("rectangle");
  await page
    .getByRole("option", { name: /Rectangle/ })
    .first()
    .click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
