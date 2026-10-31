import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import { libraryStressProject } from "./support/library-stress";
import { libraryFrame, libraryCommits } from "./support/library-observer";

const folder = "artifacts/cmyk-canvas";
const fills = [
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#00ffff",
  "#ff00ff",
  "#ffff00",
  "#999999",
  "#ff000080",
];
const fixture = () =>
  createProject({
    pages: [
      createPage({
        id: "proof",
        name: "ICC color grid",
        width: 640,
        height: 160,
        colorSpace: "cmyk",
        background: "transparent",
        layers: fills.map((fill, i) =>
          createLayer("rectangle", {
            id: `patch-${i}`,
            x: i * 80,
            y: 0,
            width: 80,
            height: 160,
            fill,
            strokeWidth: 0,
          }),
        ),
      }),
    ],
  });
async function ready(page: Page, previous?: number) {
  const projectId = await page.evaluate(() => window.musart!.snapshot().project.id);
  await page.waitForFunction(
    ({ projectId, previous }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
      return (
        canvas?.dataset.rendererReady === "true" &&
        canvas.dataset.projectId === projectId &&
        canvas.dataset.sceneRevision === canvas.dataset.renderedRevision &&
        (previous === undefined || Number(canvas.dataset.renderCount) > previous)
      );
    },
    { projectId, previous },
  );
}
async function sample(inspector: Page, url: string) {
  return inspector.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return Array.from({ length: 8 }, (_, i) => [
      ...ctx.getImageData(
        Math.floor((image.width * (i + 0.5)) / 8),
        Math.floor(image.height / 2),
        1,
        1,
      ).data,
    ]);
  }, url);
}
const dataUrl = (data: Buffer) => `data:image/png;base64,${data.toString("base64")}`;
function closeColors(actual: number[][], expected: number[][], tolerance = 3) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < actual.length; i++)
    for (let c = 0; c < 4; c++)
      expect(
        Math.abs(actual[i]![c]! - expected[i]![c]!),
        `patch ${i}, channel ${c}: ${actual[i]!.join(",")} vs ${expected[i]!.join(",")}`,
      ).toBeLessThanOrEqual(tolerance);
}

for (const backend of ["webgpu", "webgl"] as const)
  test(`${backend}: the live CMYK canvas matches native ICC output and RGB delivery without double conversion`, async ({
    page,
    browserName,
  }) => {
    await mkdir(folder, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await installReadbackProbe(page);
    await page.addInitScript((webgl) => {
      if (webgl)
        Object.defineProperty(navigator, "gpu", { configurable: true, get: () => undefined });
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
      localStorage.setItem("musart.language", "en");
    }, backend === "webgl");
    await page.goto("/editor/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate((project) => window.musart!.load(project), fixture());
    await ready(page);
    await expect(page.getByTestId("artboard").locator("canvas")).toHaveAttribute(
      "data-backend",
      backend,
    );
    await page.mouse.move(0, 0);
    const live = await page
      .getByTestId("artboard")
      .screenshot({ path: `${folder}/${backend}-canvas.png` });
    const rgb = await page.evaluate(() => window.musart!.render({ format: "png" }));
    const inspector = await page.context().newPage();
    await page.bringToFront();
    try {
      const canvasColors = await sample(inspector, dataUrl(live));
      closeColors(await sample(inspector, rgb), canvasColors, 1);
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("combobox", { name: "File format", exact: true }).click();
      await page.getByRole("option", { name: "TIFF", exact: true }).click();
      const preview = dialog.getByRole("img", { name: "Export preview", exact: true });
      await expect(preview).toBeVisible();
      const previewUrl = await preview.evaluate(async (image) => {
        const blob = await (await fetch((image as HTMLImageElement).src)).blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("Invalid preview data"));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      });
      const previewColors = await sample(inspector, previewUrl);
      closeColors(previewColors, canvasColors, 3);
      const downloading = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Export image", exact: true }).click();
      const download = await downloading;
      const tiff = `${folder}/${backend}.tiff`,
        decoded = `${folder}/${backend}-decoded.png`;
      await download.saveAs(tiff);
      execFileSync("python3", [
        "-c",
        [
          "from PIL import Image, ImageCms",
          "from io import BytesIO",
          "import sys",
          "im=Image.open(sys.argv[1])",
          "assert im.mode=='CMYK' and im.info.get('icc_profile')",
          "ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(BytesIO(im.info['icc_profile'])),'packages/render/assets/profiles/sRGB-v4.icc',renderingIntent=0,outputMode='RGB').save(sys.argv[2])",
        ].join("\n"),
        tiff,
        decoded,
      ]);
      const native = await sample(
        inspector,
        dataUrl(await import("node:fs/promises").then((fs) => fs.readFile(decoded))),
      );
      closeColors(canvasColors, native, 3);
      await expect(dialog.getByText("Export ready.", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      const previous = Number(
        await page.getByTestId("artboard").locator("canvas").getAttribute("data-render-count"),
      );
      await page.evaluate(() =>
        window.musart!.execute({ type: "updatePage", patch: { colorSpace: "srgb" } }),
      );
      await ready(page, previous);
      const unproofed = await sample(
        inspector,
        dataUrl(await page.getByTestId("artboard").screenshot()),
      );
      expect(unproofed[0]!.slice(0, 3)).toEqual([255, 0, 0]);
      expect(canvasColors[0]!.slice(0, 3)).not.toEqual(unproofed[0]!.slice(0, 3));
      const beforeUndo = Number(
        await page.getByTestId("artboard").locator("canvas").getAttribute("data-render-count"),
      );
      await page.evaluate(() => window.musart!.undo());
      await ready(page, beforeUndo);
      closeColors(
        await sample(inspector, dataUrl(await page.getByTestId("artboard").screenshot())),
        canvasColors,
        1,
      );
      const evidence = await page.evaluate(() => ({
        browser: navigator.userAgent,
        reads: window.__musartVideoReadbacks,
        gpu: JSON.parse(
          document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!.dataset
            .gpuStats ?? "{}",
        ),
      }));
      expect(evidence.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
      expect(evidence.gpu.cacheBytes).toBeLessThanOrEqual(evidence.gpu.maxBytes);
      await writeFile(
        `${folder}/${backend}.json`,
        JSON.stringify(
          { browserName, backend, ...evidence, canvasColors, previewColors, native },
          null,
          2,
        ),
      );
      expect(errors).toEqual([]);
    } finally {
      await inspector.close();
    }
  });

test("CMYK proof stays bounded and demand-driven with the 50-image / 100-effect photo workload", async ({
  page,
}) => {
  test.setTimeout(120000);
  await mkdir(folder, { recursive: true });
  const fixture = await libraryStressProject();
  fixture.project.pages[0]!.colorSpace = "cmyk";
  await installReadbackProbe(page);
  await page.addInitScript(() =>
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true })),
  );
  await page.goto("/editor/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), fixture.project);
  const first = await libraryFrame(page, fixture.project.id);
  expect(first.cacheBytes).toBeLessThanOrEqual(first.maxBytes);
  const commits = await libraryCommits(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const stable = await libraryFrame(page, fixture.project.id);
  expect(stable.passes).toBe(first.passes);
  expect(await libraryCommits(page)).toEqual(commits);
  await page.getByTestId("artboard").screenshot({ path: `${folder}/50-photo-proof.png` });
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  const environment = await page.evaluate(async () => ({
    browser: navigator.userAgent,
    adapter: (await navigator.gpu?.requestAdapter())?.info,
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
  }));
  await writeFile(
    `${folder}/50-photo-proof.json`,
    JSON.stringify({ first, stable, commits, reads, environment }, null, 2),
  );
});
