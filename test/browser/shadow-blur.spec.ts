import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Effect } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

for (const forceWebGL of [false, true])
  test(`soft edges and drop shadows export outside source bounds on ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
  }) => {
    await installReadbackProbe(page);
    await page.addInitScript(() =>
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true })),
    );
    await page.goto("/?automation=1");
    await page.waitForFunction(() => !!window.musart);
    const inspection = await page.context().newPage();
    const render = async (effects: Effect[], mask = false, scale = 1) => {
      const layer = createLayer("rectangle", {
        id: "subject",
        x: 40,
        y: 40,
        width: 32,
        height: 32,
        fill: "#ffffff",
        effects,
        ...(mask ? { mask: { layerId: "mask", enabled: true, inverted: false } } : {}),
      });
      const project = createProject({
        pages: [
          createPage({
            width: 128,
            height: 128,
            background: "transparent",
            layers: [
              layer,
              ...(mask
                ? [
                    createLayer("ellipse", {
                      id: "mask",
                      maskSource: true,
                      x: 40,
                      y: 40,
                      width: 32,
                      height: 32,
                      fill: "#ffffff",
                    }),
                  ]
                : []),
            ],
          }),
        ],
      });
      return page.evaluate(
        async ({ project, forceWebGL, scale }) => {
          window.musart!.load(project);
          return window.musart!.render({ format: "png", forceWebGL, scale });
        },
        { project, forceWebGL, scale },
      );
    };
    const inspect = (image: string, scale = 1) =>
      inspection.evaluate(
        async ({ image, scale }) => {
          const img = new Image();
          img.src = image;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(img, 0, 0);
          const pixels = context.getImageData(0, 0, img.width, img.height).data;
          const at = (x: number, y: number) =>
            Array.from(
              pixels.slice(
                (Math.floor(y * scale) * img.width + Math.floor(x * scale)) * 4,
                (Math.floor(y * scale) * img.width + Math.floor(x * scale)) * 4 + 4,
              ),
            );
          return {
            size: [img.width, img.height],
            center: at(56, 56),
            left: at(38, 56),
            top: at(56, 38),
            below: at(56, 78),
            far: at(15, 56),
            above: at(56, 30),
          };
        },
        { image, scale },
      );
    const blur = [createEffect("blur", { amount: 1, scale: 4 })];
    const blurredPng = await render(blur),
      blurred = await inspect(blurredPng);
    expect(blurred.center[3]).toBeGreaterThan(245);
    expect(blurred.left[3]).toBeGreaterThan(20);
    expect(blurred.left[3]).toBeLessThan(150);
    expect(Math.abs(blurred.left[3]! - blurred.top[3]!)).toBeLessThan(8);
    expect(blurred.left[0]).toBeGreaterThan(235);
    expect(blurred.far[3]).toBe(0);
    const masked = await inspect(await render(blur, true));
    expect(masked.left[3]).toBe(0);
    expect(masked.center[3]).toBeGreaterThan(245);
    const shadow = [
      createEffect("shadow", {
        amount: 0.65,
        settings: { radius: 4, offsetX: 0, offsetY: 10, shadowColor: "#000000" },
      }),
    ];
    const shadowPng = await render(shadow),
      shaded = await inspect(shadowPng);
    expect(shaded.center).toEqual([255, 255, 255, 255]);
    expect(shaded.below[3]).toBeGreaterThan(90);
    expect(shaded.below[3]).toBeLessThan(170);
    expect(shaded.below.slice(0, 3)).toEqual([0, 0, 0]);
    expect(shaded.above[3]).toBe(0);
    const enlarged = await inspect(await render(shadow, false, 2), 2);
    expect(enlarged.size).toEqual([256, 256]);
    expect(Math.abs(enlarged.below[3]! - shaded.below[3]!)).toBeLessThan(10);
    const disabled = await inspect(await render([{ ...shadow[0]!, amount: 0 }]));
    expect(disabled.below[3]).toBe(0);
    expect(disabled.center).toEqual([255, 255, 255, 255]);
    const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
    expect(readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    await mkdir("artifacts/shadow-blur", { recursive: true });
    const backend = forceWebGL ? "webgl" : "webgpu";
    await writeFile(
      `artifacts/shadow-blur/${backend}-blur.png`,
      Buffer.from(blurredPng.split(",")[1]!, "base64"),
    );
    await writeFile(
      `artifacts/shadow-blur/${backend}-shadow.png`,
      Buffer.from(shadowPng.split(",")[1]!, "base64"),
    );
    await writeFile(
      `artifacts/shadow-blur/${backend}.json`,
      JSON.stringify({ blurred, shaded, enlarged, masked, disabled, readbacks }, null, 2),
    );
    await inspection.close();
  });

test("fifty photographs with soft blur and shadow stay in the native GPU path", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() =>
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true })),
  );
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const { readFile } = await import("node:fs/promises");
  const dataUrl = `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/06-boathouse-1.jpg")).toString("base64")}`;
  const layers = Array.from({ length: 50 }, (_, index) =>
    createLayer("image", {
      x: 8 + (index % 10) * 48,
      y: 8 + Math.floor(index / 10) * 48,
      width: 32,
      height: 24,
      assetId: "lake",
      effects: [
        createEffect("shadow", { settings: { radius: 2, offsetY: 4 } }),
        createEffect("blur", { scale: 2, amount: 0.5 }),
      ],
    }),
  );
  const project = createProject({
    assets: {
      lake: {
        id: "lake",
        name: "Alpine lake",
        width: 1280,
        height: 960,
        mime: "image/jpeg",
        dataUrl,
      },
    },
    pages: [createPage({ width: 512, height: 256, layers })],
  });
  const result = await page.evaluate(async (project) => {
    window.musart!.load(project);
    const started = performance.now();
    const png = await window.musart!.render({ format: "png" });
    return {
      bytes: png.length,
      elapsedMs: performance.now() - started,
      readbacks: window.__musartVideoReadbacks,
    };
  }, project);
  expect(result.bytes).toBeGreaterThan(10000);
  expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await mkdir("artifacts/shadow-blur", { recursive: true });
  await writeFile("artifacts/shadow-blur/fifty-photos.json", JSON.stringify(result, null, 2));
});
