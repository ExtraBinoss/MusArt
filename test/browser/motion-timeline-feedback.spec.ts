import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

const output = "artifacts/motion/timeline-feedback";
async function prepare(page: Page) {
  await mkdir(output, { recursive: true });
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.theme", "dark");
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    const count = { active: 0, peak: 0, created: 0, destroyed: 0 };
    Object.defineProperty(window, "__transitionDevices", { value: count });
    if (typeof GPUAdapter !== "undefined") {
      const request = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function (...args) {
        const device = await Reflect.apply(request, this, args);
        count.created++;
        count.active++;
        count.peak = Math.max(count.peak, count.active);
        return device;
      };
      const destroy = GPUDevice.prototype.destroy,
        closed = new WeakSet<GPUDevice>();
      GPUDevice.prototype.destroy = function () {
        if (!closed.has(this)) {
          closed.add(this);
          count.destroyed++;
          count.active--;
        }
        destroy.call(this);
      };
    }
  });
  const layer = createLayer("rectangle", {
    id: "card",
    name: "Timeline card",
    x: 20,
    y: 30,
    width: 120,
    height: 80,
    fill: "#c57d62",
  });
  const project = createProject({
    pages: [
      createPage({
        id: "timeline-feedback",
        width: 320,
        height: 200,
        layers: [layer],
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 2, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "card-track",
              layerId: layer.id,
              start: { value: 0, rate: 1 },
              end: null,
              properties: [
                {
                  id: "card-x",
                  target: { kind: "layer", layerId: layer.id, property: "x" },
                  keyframes: [
                    { id: "first", time: { value: 1, rate: 5 }, value: 20 },
                    { id: "middle", time: { value: 1, rate: 1 }, value: 60 },
                    { id: "last", time: { value: 9, rate: 5 }, value: 100 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ],
  });
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 20000 });
  await page.evaluate((project) => window.musart!.load(project), project);
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
  await expect(page.locator(".motion-timeline-dock")).toHaveAttribute("data-motion-pinned", "true");
}
async function counts(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => {
          const value = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
          if (!value) throw Error("Missing React commit counter " + selector);
          return [selector, Number(value)];
        },
      ),
    ),
  );
}

test("timeline decoration allows marquee while interpolation icons and single trim pills remain usable", async ({
  page,
}) => {
  test.setTimeout(40000);
  await prepare(page);
  const bar = page.locator('.motion-track-wrap[data-track-id="card-track"] .motion-track');
  await page.mouse.move(5, 5);
  const rest = await bar.evaluate((node) => getComputedStyle(node).backgroundColor);
  await bar.hover();
  const hover = await bar.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(hover).not.toBe(rest);
  await bar.click();
  await page.mouse.move(5, 5);
  const active = await bar.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(active).not.toBe(hover);
  expect(active).not.toBe(rest);
  const wrap = page.locator('.motion-track-wrap[data-track-id="card-track"]');
  await expect(wrap.locator(".motion-track > i")).toHaveCount(0);
  expect(
    await wrap.locator(".motion-trim-handle").evaluateAll((nodes) =>
      nodes.every((node) => {
        const style = getComputedStyle(node, "::after");
        return Number(style.opacity) > 0 && style.width === "3px" && style.height === "12px";
      }),
    ),
  ).toBe(true);
  const origin = await page.evaluate(() => window.musart!.snapshot());
  const line = page.locator("button.motion-easing-segment").first(),
    bounds = (await line.boundingBox())!;
  const last = (await page.locator('.motion-key[data-key-id="last"]').boundingBox())!;
  await expect(line).toHaveCSS("pointer-events", "none");
  await expect(line.locator("svg")).toHaveCSS("pointer-events", "auto");
  await page.mouse.move(bounds.x + 4, bounds.y + 12);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width + 3, bounds.y + 20, { steps: 3 });
  await expect(page.locator(".motion-marquee")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.motion-key[aria-pressed="true"]')).toHaveCount(2);
  await page.locator('.motion-key[data-key-id="middle"]').click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Supprimer 2 images clés", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await line.locator("svg").click();
  const easing = page.getByRole("dialog", { name: "Interpolation", exact: true });
  await expect(easing).toBeVisible();
  await easing.getByRole("button", { name: "Annuler", exact: true }).click();
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.project).toEqual(origin.project);
  expect(after.revision).toBe(origin.revision);
  await page.screenshot({ path: `${output}/marquee-and-active.png` });
});

test("transition choices share a real retained GPU preview and release it without editor mutations", async ({
  page,
}) => {
  test.setTimeout(40000);
  await prepare(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(async () => {
    window.musart!.select(["card"]);
    await window.musart!.flushThumbnails();
  });
  const before = await page.evaluate(() => ({
    snapshot: window.musart!.snapshot(),
    devices: {
      ...(
        window as unknown as {
          __transitionDevices: { active: number; created: number; destroyed: number; peak: number };
        }
      ).__transitionDevices,
    },
  }));
  await page
    .locator(".layer-animations")
    .getByRole("button", { name: "Ajouter une animation", exact: true })
    .click();
  const panel = page.getByRole("dialog", { name: "Ajouter une animation", exact: true });
  const fadeCard = panel.getByRole("button", { name: "Fade", exact: true });
  await fadeCard.hover();
  await expect(fadeCard.locator("canvas")).toHaveAttribute("data-backend", "webgpu");
  await fadeCard
    .locator("canvas")
    .evaluate((node) =>
      Object.defineProperty(window, "__retainedTransitionCanvas", { value: node }),
    );
  const quiet = await counts(page);
  const fade = await fadeCard
    .locator(".animation-card-live")
    .screenshot({ path: `${output}/fade.png` });
  const wipeCard = panel.getByRole("button", { name: "Wipe", exact: true });
  await wipeCard.hover();
  const canvas = wipeCard.locator("canvas");
  await expect(canvas).toBeVisible();
  const wipe = await wipeCard
    .locator(".animation-card-live")
    .screenshot({ path: `${output}/wipe.png` });
  expect(fade.equals(wipe)).toBe(false);
  expect(
    await canvas.evaluate(
      (node) =>
        (window as unknown as { __retainedTransitionCanvas: HTMLCanvasElement })
          .__retainedTransitionCanvas === node,
    ),
  ).toBe(true);
  const first = Number(await canvas.getAttribute("data-preview-frames"));
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-preview-frames")))
    .toBeGreaterThan(first + 1);
  await panel.locator("header").hover();
  const frames = () =>
    page.evaluate(
      () =>
        (window as unknown as { __retainedTransitionCanvas: HTMLCanvasElement })
          .__retainedTransitionCanvas.dataset.previewFrames,
    );
  await page.waitForTimeout(120);
  const stopped = await frames();
  await page.waitForTimeout(120);
  expect(await frames()).toBe(stopped);
  expect(await counts(page)).toEqual(quiet);
  const during = await page.evaluate(() => ({
    ...(
      window as unknown as {
        __transitionDevices: { active: number; created: number; peak: number };
      }
    ).__transitionDevices,
  }));
  expect(during.created - before.devices.created).toBe(1);
  expect(during.active - before.devices.active).toBe(1);
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __transitionDevices: { active: number } }).__transitionDevices
            .active,
      ),
    )
    .toBe(before.devices.active);
  const after = await page.evaluate(() => ({
    snapshot: window.musart!.snapshot(),
    readbacks: window.__musartVideoReadbacks,
  }));
  expect(after.snapshot).toEqual(before.snapshot);
  expect(after.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await writeFile(
    `${output}/preview-proof.json`,
    JSON.stringify(
      {
        before: before.devices,
        during,
        after: after.readbacks,
        quiet,
        unchanged: true,
        retainedCanvas: true,
      },
      null,
      2,
    ),
  );
});
