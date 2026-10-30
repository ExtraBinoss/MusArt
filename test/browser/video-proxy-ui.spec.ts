import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";

test("five native videos receive automatic preview proxies while export keeps originals", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const folder = resolve("artifacts/video-proxy-ui");
  await mkdir(folder, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/video-source-witness.ts",
      "--target=browser",
      "--outfile",
      resolve(folder, "fixture.js"),
    ],
    { stdio: "pipe" },
  );
  const fixture = await readFile(resolve(folder, "fixture.js"), "utf8");
  await page.route("**/native-proxy-fixture.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: fixture }),
  );
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
    const dimensions: number[] = [];
    Object.assign(window, { __proxyDecoderWidths: dimensions });
    const configure = VideoDecoder.prototype.configure;
    VideoDecoder.prototype.configure = function (config) {
      dimensions.push(config.codedWidth ?? 0);
      return configure.call(this, config);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const project = createProject({
    id: crypto.randomUUID(),
    pages: [
      createPage({
        id: "five-video-page",
        width: 1280,
        height: 720,
        layers: [],
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 4, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [],
        },
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  // The reproducible performance cohort supplies five distinct complex originals.
  // CI generates a native 1080p source and imports it as five independently owned assets.
  const fixtureDirectory = process.env.MUSART_FIVE_VIDEO_FIXTURES;
  const files = fixtureDirectory
    ? await Promise.all(
        Array.from({ length: 5 }, async (_, i) => ({
          name: `Video ${i}.mp4`,
          mimeType: "video/mp4",
          buffer: await readFile(resolve(fixtureDirectory, `video-${i}.mp4`)),
        })),
      )
    : await (async () => {
        const data = await page.evaluate(async () => {
          const url = "/native-proxy-fixture.js";
          const module = (await import(
            /* @vite-ignore */ url
          )) as typeof import("./support/video-source-witness");
          const { blob } = await module.createVideoFixture(120, 1920, 1080);
          return { mime: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
        });
        return Array.from({ length: 5 }, (_, i) => ({
          name: `Video ${i}.${data.mime === "video/mp4" ? "mp4" : "webm"}`,
          mimeType: data.mime,
          buffer: Buffer.from(data.bytes),
        }));
      })();
  await page
    .locator('input[type="file"][accept="image/*,video/*,audio/*,.svg"]')
    .setInputFiles(files);
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(5);
  await page.evaluate(() => {
    const layers = window.musart!.snapshot().project.pages[0]!.layers;
    window.musart!.execute({
      type: "updateLayerPatches",
      patches: layers.map((layer, i) => ({
        id: layer.id,
        patch: { x: (i % 3) * 426, y: Math.floor(i / 3) * 360, width: 426, height: 240 },
      })),
    });
    window.musart!.select([]);
  });
  const canvas = page.locator(".canvas-artboard canvas[data-gpu-stats]");
  await expect
    .poll(
      async () =>
        JSON.parse((await canvas.getAttribute("data-gpu-stats")) ?? "{}").video?.proxies?.ready,
      { timeout: 40000 },
    )
    .toBe(5);
  const canonical = await page.evaluate(() => window.musart!.snapshot().project);
  await page.evaluate(() => {
    (window as unknown as { __proxyDecoderWidths: number[] }).__proxyDecoderWidths.length = 0;
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(
      async () =>
        JSON.parse((await canvas.getAttribute("data-gpu-stats")) ?? "{}").video?.playback?.length,
    )
    .toBe(5);
  const commits = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
          ],
        ),
      ),
    );
  const beforeCommits = await commits();
  expect(Object.values(beforeCommits).every(Number.isFinite)).toBe(true);
  const samples = await canvas.evaluate(
    (element) =>
      new Promise<{ at: number; time: string }[]>((resolve) => {
        const values: { at: number; time: string }[] = [],
          start = performance.now();
        let last = "";
        const tick = () => {
          const time = (element as HTMLCanvasElement).dataset.presentedMotionTime ?? "";
          if (time && time !== last) values.push({ at: performance.now() - start, time });
          last = time;
          if (performance.now() - start >= 1500) resolve(values);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const afterCommits = await commits();
  expect(afterCommits).toEqual(beforeCommits);
  const playback = await canvas.getAttribute("data-gpu-stats");
  const playbackWidths = await page.evaluate(() =>
    (window as unknown as { __proxyDecoderWidths: number[] }).__proxyDecoderWidths.slice(),
  );
  expect(samples.length).toBeGreaterThan(5);
  expect(playbackWidths).toContain(960);
  expect(playbackWidths).not.toContain(1920);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  // Pause also prepares a preview frame. Finish that native decode before measuring export.
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  await expect
    .poll(
      async () =>
        JSON.parse((await canvas.getAttribute("data-gpu-stats")) ?? "{}").video?.playback?.length,
    )
    .toBe(0);
  await page.evaluate(() => {
    (window as unknown as { __proxyDecoderWidths: number[] }).__proxyDecoderWidths.length = 0;
  });
  const png = await page.evaluate(() => window.musart!.render());
  const exportWidths = await page.evaluate(() =>
    (window as unknown as { __proxyDecoderWidths: number[] }).__proxyDecoderWidths.slice(),
  );
  expect(exportWidths).toContain(1920);
  expect(exportWidths).not.toContain(960);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(canonical);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  expect(errors).toEqual([]);
  await expect(canvas).not.toHaveAttribute("data-render-error", /.+/);
  await writeFile(
    info.outputPath("original-export.png"),
    Buffer.from(png.split(",")[1]!, "base64"),
  );
  await page.screenshot({ path: info.outputPath("five-video-preview.png") });
  await writeFile(
    info.outputPath("five-video.json"),
    JSON.stringify(
      {
        samples,
        beforeCommits,
        afterCommits,
        playback: JSON.parse(playback!),
        playbackWidths,
        exportWidths,
        errors,
      },
      null,
      2,
    ),
  );
});
