import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import { installNativeVideoProbe } from "./support/native-video-probe";

const cohort = resolve("artifacts/motion/export/audio-processing");
let bundle: string, wasm: Buffer;
test.beforeAll(async () => {
  await mkdir(cohort, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/motion-audio-processing-witness.ts",
      "--target=browser",
      "--external=harfbuzzjs/hb.wasm?url",
      "--outfile",
      resolve(cohort, "witness.js"),
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile(resolve(cohort, "witness.js"), "utf8");
  wasm = await readFile(resolve("node_modules/harfbuzzjs/hb.wasm"));
});
test("headless export preserves shared fades, finite reverb and authored fade bounds in decoded audio", async ({
  page,
  context,
}) => {
  test.setTimeout(40000);
  await installReadbackProbe(page);
  await installNativeVideoProbe(page);
  await context.route("**/motion-audio-fx.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>Audio processing export</title><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/motion-audio-font.js"}}</script>',
    }),
  );
  await context.route("**/motion-audio-font.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'export default "/motion-audio-font.wasm";',
    }),
  );
  await context.route("**/motion-audio-font.wasm", (route) =>
    route.fulfill({ contentType: "application/wasm", body: wasm }),
  );
  await context.route("**/motion-audio-fx.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  await page.goto("/motion-audio-fx.html", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async () => {
    const path = "/motion-audio-fx.js";
    const witness = (await import(
      /* @vite-ignore */ path
    )) as typeof import("./support/motion-audio-processing-witness");
    return witness.runMotionAudioProcessingWitness();
  });
  const { encoded, ...evidence } = result;
  await writeFile(resolve(cohort, "processed.webm"), Buffer.from(encoded.split(",")[1]!, "base64"));
  await writeFile(resolve(cohort, "production.json"), JSON.stringify(evidence, null, 2));
  expect(result).toMatchObject({
    backend: "webgpu",
    duration: { value: 4, rate: 5 },
    encodedDuration: { value: 4, rate: 5 },
    frameCount: 8,
    projectUnchanged: true,
  });
  expect(result.seekMaxError).toBeLessThan(1e-7);
  expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  expect(result.resources).toMatchObject({ framesOpen: 0, decodersOpen: 0, duplicateCloses: 0 });
  const inspector = await context.newPage();
  try {
    await inspector.goto("/motion-audio-fx.html", { waitUntil: "domcontentloaded" });
    const decoded = await inspector.evaluate(async (encoded) => {
      const path = "/motion-audio-fx.js";
      const witness = (await import(
        /* @vite-ignore */ path
      )) as typeof import("./support/motion-audio-processing-witness");
      return witness.inspectMotionAudioProcessing(encoded);
    }, encoded);
    await writeFile(resolve(cohort, "decoded.json"), JSON.stringify(decoded, null, 2));
    expect(decoded).toMatchObject({ codec: "opus", channels: 2, sampleRate: 48000 });
    expect(decoded.duration).toBeCloseTo(0.8, 6);
    for (let index = 0; index < decoded.rms.length; index++)
      expect(Math.abs(decoded.rms[index]! - result.expectedRms[index]!)).toBeLessThan(0.01);
    expect(decoded.rms[1]).toBeGreaterThan(0.09);
    expect(decoded.rms[0]).toBeLessThan(decoded.rms[1]! * 0.3);
    expect(decoded.rms[2]).toBeLessThan(decoded.rms[1]! * 0.3);
    expect(result.expectedRms[3]).toBeGreaterThan(0.001);
    expect(decoded.rms[3]).toBeGreaterThan(0.001);
    expect(decoded.rms[4]).toBeLessThan(0.005);
    expect(decoded.rms[5]).toBeGreaterThan(0.09);
  } finally {
    await inspector.close();
  }
});
