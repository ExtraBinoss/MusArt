import { chromium, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installNativeVideoProbe } from "./support/native-video-probe";
import { installReadbackProbe } from "./support/readback-probe";

test("original NTSC sampling keeps exact frame boundaries without copying pixels into JavaScript", async () => {
  test.setTimeout(20000);
  const cohort = resolve("artifacts/video-ntsc-native");
  await mkdir(cohort, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/video-ntsc-witness.ts",
      "--target=browser",
      "--outfile",
      resolve(cohort, "witness.js"),
    ],
    { stdio: "pipe", timeout: 10000, killSignal: "SIGTERM" },
  );
  const bundle = await readFile(resolve(cohort, "witness.js"), "utf8");
  // This test owns its browser, independent of user sessions and the shared fixture browser.
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await installNativeVideoProbe(page);
    await installReadbackProbe(page);
    await page.route("**/video-ntsc-witness.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>NTSC witness</title>",
      }),
    );
    await page.route("**/video-ntsc-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:4173";
    await page.goto(new URL("/video-ntsc-witness.html", baseURL).href);
    const result = await page.evaluate(async () => {
      const url = "/video-ntsc-witness.js";
      const witness = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/video-ntsc-witness");
      return witness.runVideoNtscWitness();
    });
    await writeFile(resolve(cohort, "report.json"), JSON.stringify(result, null, 2));
    const expected = [
      { value: 0, rate: 1 },
      { value: 1001, rate: 30000 },
      { value: 1001, rate: 15000 },
      { value: 1001, rate: 10000 },
    ];
    expect(result.metadata).toMatchObject({ codec: "avc", timeResolution: 30000 });
    expect(result.random.map((frame) => frame.timestamp)).toEqual(
      [2, 1, 3, 0].map((index) => expected[index]),
    );
    for (const frames of [result.exact, result.forward])
      expect(frames.map((frame) => frame.timestamp)).toEqual(expected);
    expect(result.readbacks).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
      videoFrameHook: true,
    });
    expect(result.native).toMatchObject({
      hooked: true,
      framesOpen: 0,
      decodersOpen: 0,
      duplicateCloses: 0,
    });
    expect(result.source).toMatchObject({ openBackends: 0, borrowedFrames: 0, cachedFrames: 0 });
    expect(result.cursor).toMatchObject({ decoderReservationBytes: 0, borrowedFrames: 0 });
  } finally {
    await browser.close();
  }
});
