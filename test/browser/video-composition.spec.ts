import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import { installNativeVideoProbe } from "./support/native-video-probe";
const cohort = resolve("artifacts/video-composition-native");
let bundle: string;
test.beforeAll(async () => {
  await mkdir(cohort, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/video-composition-witness.ts",
      "--target=browser",
      "--outfile",
      resolve(cohort, "witness.js"),
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile(resolve(cohort, "witness.js"), "utf8");
});
for (const forceWebGL of [false, true])
  test(`video composition uses real groups, image overlays, masks and GPU effects (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    await installReadbackProbe(page);
    await installNativeVideoProbe(page);
    await page.route("**/video-composition-witness.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Video compositing witness</title>",
      }),
    );
    await page.route("**/video-composition-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/video-composition-witness.html");
    const result = await page.evaluate(async (webgl) => {
      const url = "/video-composition-witness.js";
      const module = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/video-composition-witness");
      return module.runVideoCompositionWitness(webgl);
    }, forceWebGL);
    const backend = forceWebGL ? "webgl" : "webgpu";
    await writeFile(resolve(cohort, `${backend}.json`), JSON.stringify(result, null, 2));
    expect(result.nativeResources).toMatchObject({
      framesOpen: 0,
      decodersOpen: 0,
      duplicateCloses: 0,
    });
    expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    expect(result.images).toHaveLength(7);
    const inspection = await context.newPage();
    try {
      const pixels = await inspection.evaluate(async (images) => {
        const pixels = [];
        for (const encoded of images) {
          const image = new Image();
          image.src = encoded;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 64;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          pixels.push(
            [
              [8, 8],
              [32, 32],
              [60, 8],
            ].map(([x, y]) => [...context.getImageData(x!, y!, 1, 1).data]),
          );
        }
        return pixels;
      }, result.images);
      const colors = [
        [224, 32, 32],
        [32, 208, 64],
        [32, 32, 224],
        [32, 208, 64],
        [224, 32, 32],
        [32, 32, 224],
        [255, 255, 255],
      ];
      for (let index = 0; index < pixels.length; index++) {
        for (let channel = 0; channel < 3; channel++)
          expect(Math.abs(pixels[index]![0]![channel]! - colors[index]![channel]!)).toBeLessThan(
            16,
          );
        expect(pixels[index]![1]).toEqual([255, 255, 255, 255]);
        expect(pixels[index]![2]).toEqual([255, 255, 255, 255]);
      }
      await writeFile(resolve(cohort, `${backend}-pixels.json`), JSON.stringify(pixels));
    } finally {
      await inspection.close();
    }
  });
