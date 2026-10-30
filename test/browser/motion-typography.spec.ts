import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string;
test.beforeAll(async () => {
  const path = resolve("artifacts/morph-witness.js");
  execFileSync(
    "bun",
    ["build", "test/browser/support/morph-witness.ts", "--target=browser", "--outfile", path],
    { stdio: "pipe" },
  );
  bundle = await readFile(path, "utf8");
});
for (const forceWebGL of [false, true])
  test(`native contour morph retains geometry on ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
  }) => {
    await installReadbackProbe(page);
    await page.route("**/morph-witness.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Native morph witness</title>",
      }),
    );
    await page.route("**/morph-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/morph-witness.html");
    const result = await page.evaluate(async (forceWebGL) => {
      const url = "/morph-witness.js";
      const module = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/morph-witness");
      return module.runMorphWitness(forceWebGL);
    }, forceWebGL);
    expect(result.stats?.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    expect(result.frames.every((frame) => frame.uploads === 1)).toBe(true);
    expect(result.frames.find((frame) => frame.frame === 30)!.png).toBe(result.frames.at(-2)!.png);
    expect(result.frames[0]!.png).toBe(result.frames.at(-1)!.png);
    expect(result.text[0]).not.toBe(result.text[1]);
    expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    for (const frame of result.frames.slice(0, forceWebGL ? 5 : 67))
      await writeFile(
        test.info().outputPath(`${forceWebGL ? "webgl" : "webgpu"}-${frame.frame}.png`),
        Buffer.from(frame.png.split(",")[1]!, "base64"),
      );
    for (let i = 0; i < result.text.length; i++)
      await writeFile(
        test.info().outputPath(`text-${i}.png`),
        Buffer.from(result.text[i]!.split(",")[1]!, "base64"),
      );
    await writeFile(
      test.info().outputPath("vector.png"),
      Buffer.from(result.shape.split(",")[1]!, "base64"),
    );
    await writeFile(
      test.info().outputPath("measurements.json"),
      JSON.stringify(
        {
          frames: result.frames.map(({ png: _, ...frame }) => frame),
          stats: result.stats,
          readbacks: result.readbacks,
        },
        null,
        2,
      ),
    );
    if (!forceWebGL) {
      const video = await page.evaluate(async () => {
        const url = "/morph-witness.js";
        return (
          (await import(/* @vite-ignore */ url)) as typeof import("./support/morph-witness")
        ).exportMorphReference();
      });
      expect(video.frames).toBe(67);
      expect(video.duration).toEqual({ value: 67, rate: 30 });
      expect(video.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
      await writeFile(
        test.info().outputPath("morphing-type.mp4"),
        Buffer.from(video.data.split(",")[1]!, "base64"),
      );
    }
  });
