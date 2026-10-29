import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installNativeVideoProbe } from "./support/native-video-probe";
import { installReadbackProbe } from "./support/readback-probe";

const cohort = resolve("artifacts/video-source-native");
let bundle: string;

test.beforeAll(async () => {
  await mkdir(cohort, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/video-source-witness.ts",
      "--target=browser",
      "--outfile",
      resolve(cohort, "witness.js"),
    ],
    { cwd: process.cwd(), stdio: "pipe" },
  );
  bundle = await readFile(resolve(cohort, "witness.js"), "utf8");
});

for (const forceWebGL of [false, true])
  test(`original video decode and frame-texture witness (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    await installReadbackProbe(page);
    await installNativeVideoProbe(page);
    await page.route("**/video-source-witness.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Native video source witness</title>",
      }),
    );
    await page.route("**/video-source-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/video-source-witness.html");
    const result = await page.evaluate(async (webgl) => {
      const url = "/video-source-witness.js";
      const witness = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/video-source-witness");
      return witness.runVideoSourceWitness(webgl);
    }, forceWebGL);
    const backend = forceWebGL ? "webgl" : "webgpu";
    await writeFile(resolve(cohort, `${backend}.json`), JSON.stringify(result, null, 2));
    expect(result.backend).toBe(backend);
    expect(result.pts).toEqual([0, 0.25, 0.75, 0.75, 0.25, 0, 0, 0.25, 0.75]);
    expect(result.beforeFirstNull).toBe(true);
    expect(result.exclusiveEndNull).toBe(true);
    expect(result.stats.cacheHits).toBeGreaterThanOrEqual(3);
    expect(result.stats.openBackends).toBe(0);
    expect(result.stats.borrowedFrames).toBe(0);
    expect(result.stats.cachedFrames).toBe(0);
    expect(result.stats.accountedFrameBytes).toBe(0);
    expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    expect(result.nativeResources).toMatchObject({ hooked: true, framesOpen: 0, decodersOpen: 0 });
    const inspection = await context.newPage();
    try {
      const pixels = await inspection.evaluate(async (images) => {
        const values = [];
        for (const encoded of images) {
          const image = new Image();
          image.src = encoded;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 64;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          values.push([...context.getImageData(32, 32, 1, 1).data]);
        }
        return values;
      }, result.images);
      const expected = [
        [224, 32, 32],
        [32, 208, 64],
        [32, 32, 224],
      ];
      for (let index = 0; index < pixels.length; index++) {
        const color = expected[[0, 1, 2, 2, 1, 0, 0, 1, 2][index]!]!;
        expect(pixels[index]![3]).toBe(255);
        for (let channel = 0; channel < 3; channel++)
          expect(Math.abs(pixels[index]![channel]! - color[channel]!)).toBeLessThan(16);
      }
      await writeFile(resolve(cohort, `${backend}-pixels.json`), JSON.stringify(pixels));
    } finally {
      await inspection.close();
    }
  });
