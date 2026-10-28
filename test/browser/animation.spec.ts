import { expect, test, type Page, type Download } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

interface VideoWitness {
  width: number;
  height: number;
  duration: number;
  first: number[];
  last: number[];
  firstHash: number;
  lastHash: number;
}
async function inspectVideo(inspector: Page, bytes: Buffer, mime: string): Promise<VideoWitness> {
  return inspector.evaluate(
    async ({ source }) => {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.src = source;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () =>
          reject(new Error(`Native video decode failed: ${video.error?.message}`));
      });
      const width = video.videoWidth,
        height = video.videoHeight,
        duration = video.duration;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      async function frame(time: number) {
        if (video.currentTime !== time)
          await new Promise<void>((resolve, reject) => {
            video.onseeked = () => resolve();
            video.onerror = () => reject(new Error("Native video seek failed"));
            video.currentTime = time;
          });
        context.drawImage(video, 0, 0);
        const data = context.getImageData(0, 0, width, height).data;
        let hash = 2166136261;
        for (let index = 0; index < data.length; index += 13) {
          hash ^= data[index]!;
          hash = Math.imul(hash, 16777619);
        }
        const offset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
        return { hash: hash >>> 0, color: Array.from(data.slice(offset, offset + 4)) };
      }
      const first = await frame(0),
        last = await frame(Math.max(0, duration - 0.025));
      video.removeAttribute("src");
      video.load();
      return {
        width,
        height,
        duration,
        first: first.color,
        last: last.color,
        firstHash: first.hash,
        lastHash: last.hash,
      };
    },
    { source: `data:${mime};base64,${bytes.toString("base64")}` },
  );
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function downloadVideo(page: Page, format: "WebM" | "MP4"): Promise<Download> {
  await choose(page, "Format", format);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
  return downloading;
}

test("automatic history becomes a real encoded video with changing frames and zero editor readbacks", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator(".canvas-artboard canvas[data-renderer-ready=true]")).toBeVisible();
  const project = createProject({
    name: "Video QA",
    pages: [createPage({ id: "video-page", width: 320, height: 220, background: "#ffffff" })],
  });
  const layer = createLayer("rectangle", {
    id: "video-layer",
    name: "Video artwork",
    x: 0,
    y: 0,
    width: 320,
    height: 220,
    fill: "#ff3344",
  });
  await page.evaluate(
    async ({ project, layer }) => {
      const api = window.musart!;
      api.load(project);
      api.execute({ type: "addLayers", layers: [layer] });
      api.execute({ type: "updateLayers", ids: [layer.id], patch: { fill: "#22bb66" } });
      api.execute({ type: "updateLayers", ids: [layer.id], patch: { fill: "#2563eb" } });
      await api.flush();
    },
    { project, layer },
  );
  const history = await page.evaluate(() => window.musart!.historyInfo());
  expect(history).toMatchObject({ ready: true, error: false, pending: 0 });
  expect(history.events).toBeGreaterThanOrEqual(3);
  const before = await page.evaluate(() => window.musart!.snapshot());
  await page.getByRole("tab", { name: "Animation", exact: true }).click();
  await page.getByRole("button", { name: "Préparer le timelapse", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Position de lecture" })).toBeVisible();
  for (const [label, value] of [
    ["Durée", "0.2"],
    ["Fréquence", "10"],
    ["Résolution", "1"],
  ]) {
    const field = page.getByRole("textbox", { name: label, exact: true });
    await field.fill(value!);
    await field.press("Tab");
  }
  const inspector = await page.context().newPage();
  const witnesses: Record<string, VideoWitness> = {};
  try {
    for (const format of ["WebM", "MP4"] as const) {
      if (format === "MP4") {
        const supported = await page.evaluate(
          async () =>
            typeof VideoEncoder !== "undefined" &&
            (
              await VideoEncoder.isConfigSupported({
                codec: "avc1.42001f",
                width: 320,
                height: 220,
                framerate: 10,
                bitrate: 1000000,
              })
            ).supported,
        );
        if (!supported) {
          testInfo.annotations.push({
            type: "codec",
            description: "Native AVC encoding unavailable; mandatory WebM path verified.",
          });
          continue;
        }
      }
      const download = await downloadVideo(page, format);
      expect(download.suggestedFilename()).toBe(
        `Video QA-replay.${format === "MP4" ? "mp4" : "webm"}`,
      );
      await download.saveAs(
        `artifacts/videos/creative-replay.${format === "MP4" ? "mp4" : "webm"}`,
      );
      const bytes = await readFile((await download.path())!);
      if (format === "MP4") expect(bytes.subarray(4, 8).toString("ascii")).toBe("ftyp");
      else expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
      const witness = await inspectVideo(
        inspector,
        bytes,
        format === "MP4" ? "video/mp4" : "video/webm",
      );
      witnesses[format] = witness;
      expect(witness).toMatchObject({ width: 320, height: 220 });
      expect(witness.duration).toBeGreaterThanOrEqual(0.19);
      expect(witness.duration).toBeLessThanOrEqual(0.25);
      expect(witness.lastHash).not.toBe(witness.firstHash);
      expect(witness.last[0]).toBeLessThan(100);
      expect(witness.last[2]).toBeGreaterThan(150);
    }
  } finally {
    await inspector.close();
  }
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
  const readbacks = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect(readbacks).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    gpuHook: true,
    webglHook: true,
    canvasHook: true,
  });
  expect(errors).toEqual([]);
  await writeFile(
    "artifacts/video-report.json",
    JSON.stringify({ history, readbacks, witnesses }, null, 2),
  );
  await testInfo.attach("native-video-witnesses", {
    body: JSON.stringify({ history, readbacks, witnesses }, null, 2),
    contentType: "application/json",
  });
});
