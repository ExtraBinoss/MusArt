import { expect, test, type Page } from "@playwright/test";
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
async function reactCommits(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => {
          const value = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
          if (value === undefined) throw new Error(`Missing React counter: ${selector}`);
          return [selector, Number(value)];
        },
      ),
    ),
  );
}
async function inspectVideo(inspector: Page, bytes: Buffer, mime: string): Promise<VideoWitness> {
  return inspector.evaluate(
    async ({ source }) => {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.playsInline = true;
      document.body.append(video);
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
            let handle = 0;
            const timeout = setTimeout(() => {
              video.cancelVideoFrameCallback(handle);
              reject(new Error(`Native frame was not presented for ${time}s`));
            }, 10000);
            function presented(_now: number, metadata: VideoFrameCallbackMetadata) {
              if (!video.seeking && Math.abs(metadata.mediaTime - time) <= 0.05) {
                clearTimeout(timeout);
                resolve();
              } else handle = video.requestVideoFrameCallback(presented);
            }
            // seeked can precede presentation; do not read the previous decoded canvas frame.
            handle = video.requestVideoFrameCallback(presented);
            video.onerror = () => {
              clearTimeout(timeout);
              reject(new Error("Native video seek failed"));
            };
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
      video.remove();
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
  await page.getByRole("button", { name: "Options d’export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exporter un timelapse…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Timelapse", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("tab", { name: "Animation", exact: true })).toHaveCount(0);
  const exportButton = dialog.getByRole("button", { name: "Exporter la vidéo", exact: true });
  await expect(exportButton).toBeEnabled();
  const duration = dialog.getByRole("spinbutton", {
    name: "Durée finale de la vidéo",
    exact: true,
  });
  for (const value of ["0", "31", ""]) {
    await duration.fill(value);
    await expect(exportButton).toBeDisabled();
  }
  await duration.fill("1.03");
  await expect(exportButton).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Lire l’aperçu", exact: true })).toBeEnabled();
  const replayDuration = await page.evaluate(
    async () => (await window.musart!.historyReplay()).duration,
  );
  const scrubber = dialog.getByRole("slider", { name: "Position de l’aperçu", exact: true });
  const commitsBefore = await reactCommits(page);
  await scrubber.focus();
  await scrubber.press("End");
  await expect(dialog.locator("[data-history-time]")).toHaveAttribute(
    "data-history-time",
    String(replayDuration),
  );
  await scrubber.press("Home");
  await expect(dialog.locator("[data-history-time]")).toHaveAttribute("data-history-time", "0");
  await dialog.getByRole("button", { name: "Lire l’aperçu", exact: true }).click();
  await expect(dialog.locator("[data-history-time]")).not.toHaveAttribute("data-history-time", "0");
  await dialog.getByRole("button", { name: "Mettre l’aperçu en pause", exact: true }).click();
  const commitsAfter = await reactCommits(page);
  expect(commitsAfter).toEqual(commitsBefore);
  await dialog.screenshot({ path: "artifacts/timelapse-dialog.png" });
  const inspector = await page.context().newPage();
  let witness: VideoWitness;
  try {
    const downloading = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloading;
    const mp4 = download.suggestedFilename().endsWith(".mp4");
    expect(download.suggestedFilename()).toBe(`Video QA-timelapse.${mp4 ? "mp4" : "webm"}`);
    await download.saveAs(`artifacts/videos/creative-timelapse.${mp4 ? "mp4" : "webm"}`);
    const bytes = await readFile((await download.path())!);
    if (mp4) expect(bytes.subarray(4, 8).toString("ascii")).toBe("ftyp");
    else expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
    witness = await inspectVideo(inspector, bytes, mp4 ? "video/mp4" : "video/webm");
    await writeFile("artifacts/timelapse-native-witness.json", JSON.stringify(witness, null, 2));
    expect(witness).toMatchObject({ width: 320, height: 220 });
    expect(witness.duration).toBeCloseTo(1.03, 2);
    expect(witness.lastHash).not.toBe(witness.firstHash);
    expect(witness.last[0]).toBeLessThan(100);
    expect(witness.last[2]).toBeGreaterThan(150);
    await expect(dialog.getByText("Votre timelapse est prêt.", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Options d’export", exact: true })).toBeFocused();
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
    JSON.stringify({ history, readbacks, witness, commitsBefore, commitsAfter }, null, 2),
  );
  await testInfo.attach("native-video-witness", {
    body: JSON.stringify({ history, readbacks, witness, commitsBefore, commitsAfter }, null, 2),
    contentType: "application/json",
  });
});
