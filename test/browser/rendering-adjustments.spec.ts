import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Asset,
  type EffectType,
  type Project,
} from "@musart/core";
async function load(page: Page, project: Project) {
  await page.evaluate((project) => window.musart!.load(project), project);
}
async function pixels(page: Page, forceWebGL: boolean) {
  return page.evaluate(async (forceWebGL) => {
    const image = new Image();
    image.src = await window.musart!.render({ forceWebGL });
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  }, forceWebGL);
}
test("new GPU adjustments alter RGB, preserve each pixel alpha and deterministic seeds across both backends", async ({
  page,
}) => {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const types: EffectType[] = [
    "exposure",
    "saturation",
    "hue",
    "vibrance",
    "temperature",
    "tint",
    "gamma",
    "invert",
    "sepia",
    "threshold",
    "posterize",
    "grain",
    "halftone",
    "vignette",
  ];
  const layer = createLayer("rectangle", {
    id: "effect-fixture",
    x: 4,
    y: 4,
    width: 24,
    height: 24,
    fill: "#4080c080",
    radius: 0,
  });
  const composition = createPage({
    width: 32,
    height: 32,
    background: "transparent",
    layers: [layer],
  });
  await load(page, createProject({ pages: [composition] }));
  const baseline = await pixels(page, false);
  for (const type of types) {
    const effect = createEffect(type, {
      amount: 0.8,
      scale: 4,
      levels: 6,
      color: true,
      seed: 9321,
    });
    await load(
      page,
      createProject({ pages: [{ ...composition, layers: [{ ...layer, effects: [effect] }] }] }),
    );
    const gpu = await pixels(page, false),
      fallback = await pixels(page, true);
    expect(gpu, type).not.toEqual(baseline);
    expect(fallback, type).toEqual(gpu);
    for (let index = 3; index < gpu.length; index += 4)
      expect(gpu[index], `${type} alpha`).toBe(baseline[index]);
    if (type === "grain") {
      expect(await pixels(page, false)).toEqual(gpu);
      await load(
        page,
        createProject({
          pages: [{ ...composition, layers: [{ ...layer, effects: [{ ...effect, seed: 2 }] }] }],
        }),
      );
      expect(await pixels(page, false)).not.toEqual(gpu);
    }
  }
});
test("Display-P3 converts imported sRGB assets and branded SVGs back to RGB output; print proof is explicit and opaque", async ({
  page,
}) => {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const asset: Asset = {
    id: "srgb",
    name: "source",
    mime: "image/svg+xml",
    width: 8,
    height: 8,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><path fill="#40a080" d="M0 0h8v8H0z"/></svg>').toString("base64")}`,
  };
  const image = createLayer("image", { assetId: asset.id, x: 0, y: 0, width: 8, height: 8 }),
    vector = createLayer("vector", {
      x: 8,
      y: 0,
      width: 8,
      height: 8,
      vector: {
        viewBox: "0 0 8 8",
        preserveColors: true,
        parts: [{ path: "M0 0h8v8H0z", fill: "#40a080" }],
      },
    });
  const composition = createPage({
    width: 16,
    height: 8,
    background: "transparent",
    layers: [image, vector],
  });
  for (const forceWebGL of [false, true]) {
    await load(page, createProject({ assets: { srgb: asset }, pages: [composition] }));
    const original = await pixels(page, forceWebGL);
    await load(
      page,
      createProject({
        assets: { srgb: asset },
        pages: [{ ...composition, colorSpace: "display-p3" }],
      }),
    );
    const p3 = await pixels(page, forceWebGL);
    p3.forEach((value, index) => expect(Math.abs(value - original[index]!)).toBeLessThanOrEqual(2));
    await load(
      page,
      createProject({
        assets: { srgb: asset },
        pages: [{ ...composition, colorSpace: "cmyk-proof" }],
      }),
    );
    const proof = await pixels(page, forceWebGL);
    expect(proof).not.toEqual(original);
    for (let index = 3; index < proof.length; index += 4) expect(proof[index]).toBe(255);
  }
});
