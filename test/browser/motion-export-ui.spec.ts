import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

function project() {
  const still = createPage({
    id: "still",
    name: "Base design",
    width: 64,
    height: 32,
    background: "#336699",
  });
  const rectangle = createLayer("rectangle", {
    id: "artwork",
    x: 0,
    y: 0,
    width: 64,
    height: 32,
    fill: "#ff3333",
  });
  const animated = createPage({
    id: "animated",
    name: "Animated artwork",
    width: 64,
    height: 32,
    background: "#ffffff",
    layers: [rectangle],
  });
  const engine = new EditorEngine(createProject({ pages: [still, animated] }));
  engine.setPage(animated.id);
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 1, rate: 1 } });
  for (const value of [0, 1])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: {
        kind: "layer",
        layerId: rectangle.id,
        property: "x",
      },
      time: { value, rate: 1 },
      value: value * 32,
    });
  return engine.getSnapshot().project;
}
async function prepare(page: Page, forceWebGL = false) {
  await installReadbackProbe(page);
  await page.addInitScript((webgl) => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
    if (webgl) Object.defineProperty(navigator, "gpu", { value: undefined });
    const counts = { webgpu: 0, webgl: 0 };
    Object.defineProperty(window, "__exportDisposed", { value: counts });
    if (typeof GPUDevice !== "undefined") {
      const destroy = GPUDevice.prototype.destroy;
      Object.defineProperty(GPUDevice.prototype, "destroy", {
        value: function (this: GPUDevice) {
          counts.webgpu++;
          destroy.call(this);
        },
      });
    }
    const wrapped = new WeakSet<object>();
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const get = prototype.getExtension;
      Object.defineProperty(prototype, "getExtension", {
        value: function (this: WebGLRenderingContext, name: string) {
          const extension: unknown = Reflect.apply(get, this, [name]);
          if (
            name === "WEBGL_lose_context" &&
            extension &&
            typeof extension === "object" &&
            "loseContext" in extension &&
            typeof extension.loseContext === "function" &&
            !wrapped.has(extension)
          ) {
            wrapped.add(extension);
            const lose = extension.loseContext;
            Object.defineProperty(extension, "loseContext", {
              value: () => {
                counts.webgl++;
                Reflect.apply(lose, extension, []);
              },
            });
          }
          return extension;
        },
      });
    }
  }, forceWebGL);
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), project());
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
}
async function commits(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => {
          const value = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
          if (value === undefined) throw new Error("Missing React commit counter: " + selector);
          return [selector, Number(value)];
        },
      ),
    ),
  );
}
for (const forceWebGL of [false, true])
  test(
    "common Exporter previews and delivers Motion without editing the document (" +
      (forceWebGL ? "WebGL" : "WebGPU") +
      ")",
    async ({ page, context }) => {
      test.setTimeout(40000);
      await mkdir("artifacts/motion/export", { recursive: true });
      await prepare(page, forceWebGL);
      const before = await page.evaluate(() => window.musart!.snapshot());
      await page
        .locator('.artboard-heading[data-artboard-id="animated"] .artboard-options')
        .click();
      await page.getByRole("menuitem", { name: "Exporter la composition…", exact: true }).click();
      const panel = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
      await expect(
        panel.getByRole("combobox", { name: "Plan de travail", exact: true }),
      ).toHaveText("Animated artwork");
      const backend = forceWebGL ? "webgl" : "webgpu";
      await expect(panel.locator(".motion-export-preview-surface canvas")).toHaveAttribute(
        "data-backend",
        backend,
      );
      const countsBefore = await commits(page);
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector(".motion-export-preview output")?.textContent?.replace(" s", ""),
          ) > 0.15,
      );
      expect(await commits(page)).toEqual(countsBefore);
      expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
      await panel.screenshot({ path: "artifacts/motion/export/" + backend + "-panel.png" });
      const destroyedBefore = await page.evaluate(
        (backend) =>
          (window as unknown as { __exportDisposed: Record<string, number> }).__exportDisposed[
            backend
          ]!,
        backend,
      );
      const delivery = page.waitForEvent("download");
      await panel.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
      const download = await delivery;
      const path = await download.path();
      if (!path) throw new Error("No delivered video file");
      const bytes = await readFile(path),
        mime = download.suggestedFilename().endsWith(".mp4") ? "video/mp4" : "video/webm";
      await expect(panel).not.toBeVisible();
      await page.waitForFunction(
        ({ backend, before }) =>
          (window as unknown as { __exportDisposed: Record<string, number> }).__exportDisposed[
            backend
          ]! >=
          before + 2,
        { backend, before: destroyedBefore },
      );
      expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
      const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
      expect(readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
      const inspector = await context.newPage();
      try {
        const decoded = await inspector.evaluate(
          async ({ encoded, mime }) => {
            const video = document.createElement("video");
            video.muted = true;
            video.preload = "auto";
            video.src = "data:" + mime + ";base64," + encoded;
            await new Promise<void>((resolve, reject) => {
              video.onloadeddata = () => resolve();
              video.onerror = () => reject(Error("Delivered video cannot decode"));
            });
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext("2d")!;
            context.drawImage(video, 0, 0);
            const result = {
              width: video.videoWidth,
              height: video.videoHeight,
              duration: video.duration,
              pixel: [...context.getImageData(4, 16, 1, 1).data],
            };
            video.removeAttribute("src");
            video.load();
            return result;
          },
          { encoded: bytes.toString("base64"), mime },
        );
        expect(decoded).toMatchObject({ width: 64, height: 32 });
        expect(decoded.duration).toBeCloseTo(1, 2);
        expect(decoded.pixel[0]).toBeGreaterThan(220);
        expect(decoded.pixel[1]).toBeLessThan(80);
        await writeFile(
          "artifacts/motion/export/" + backend + "-ui.json",
          JSON.stringify({ decoded, bytes: bytes.length, readbacks, countsBefore }, null, 2),
        );
      } finally {
        await inspector.close();
      }
    },
  );

test("common Exporter preserves the default active Static design and delivers a decoded image", async ({
  page,
  context,
}) => {
  test.setTimeout(40000);
  await prepare(page);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  await expect(panel.getByRole("combobox", { name: "Plan de travail", exact: true })).toHaveText(
    "Base design",
  );
  const delivery = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Exporter l’image", exact: true }).click();
  const download = await delivery,
    path = await download.path();
  if (!path) throw new Error("No delivered image file");
  const bytes = await readFile(path),
    inspector = await context.newPage();
  try {
    const decoded = await inspector.evaluate(async (encoded) => {
      const image = new Image();
      image.src = "data:image/png;base64," + encoded;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        pixel: [...context.getImageData(4, 4, 1, 1).data],
      };
    }, bytes.toString("base64"));
    expect(decoded).toEqual({ width: 64, height: 32, pixel: [51, 102, 153, 255] });
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
    });
  } finally {
    await inspector.close();
  }
});
