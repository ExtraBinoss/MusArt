import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

async function presented(page: Page, after = 0) {
  await page.waitForFunction((after) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas"),
      data = canvas?.dataset;
    return (
      data?.rendererReady === "true" &&
      data.sceneRevision === data.renderedRevision &&
      Number(data.renderCount) > after
    );
  }, after);
}
async function state(page: Page) {
  return page.evaluate(() => {
    const snapshot = window.musart!.snapshot(),
      canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
    return {
      fill: snapshot.project.pages[0]!.layers[0]!.fill,
      revision: snapshot.revision,
      undo: snapshot.canUndo,
      renderCount: Number(canvas.dataset.renderCount),
      uploads: (JSON.parse(canvas.dataset.gpuStats!) as { uploads: number }).uploads,
      commits: Object.fromEntries(
        [".musart-app", ".canvas-area", ".editor-canvas", ".editor-gpu-scene", ".inspector"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
          ],
        ),
      ),
    };
  });
}
async function pixel(page: Page, inspector: Page) {
  const url = await page
    .locator(".canvas-artboard canvas")
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
  return inspector.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return Array.from(
      context.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data,
    );
  }, url);
}
test("compact vertical hue/alpha preview real GPU pixels with no editor React commits, then commit once", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["paint-witness"]);
    },
    createProject({
      pages: [
        createPage({
          width: 320,
          height: 240,
          background: "#ffffff",
          layers: [
            createLayer("rectangle", {
              id: "paint-witness",
              name: "Paint witness",
              x: 32,
              y: 32,
              width: 240,
              height: 160,
              fill: "#ff000080",
              radius: 0,
            }),
          ],
        }),
      ],
    }),
  );
  await presented(page);
  await page.evaluate(() => window.musart!.flushThumbnails());
  const inspector = await page.context().newPage();
  try {
    const sv = page.locator(".color-sv-pad"),
      hue = page.locator(".color-hue"),
      alpha = page.locator(".color-alpha");
    const boxes = {
      sv: (await sv.boundingBox())!,
      hue: (await hue.boundingBox())!,
      alpha: (await alpha.boundingBox())!,
    };
    expect(boxes.sv.height).toBe(132);
    expect(boxes.hue.height).toBe(132);
    expect(boxes.alpha.height).toBe(132);
    expect(boxes.hue.x).toBeGreaterThan(boxes.sv.x + boxes.sv.width);
    expect(boxes.alpha.x).toBeGreaterThan(boxes.hue.x);
    await expect(page.getByRole("slider", { name: "Teinte", exact: true })).toHaveAttribute(
      "aria-orientation",
      "vertical",
    );
    await expect(page.getByRole("slider", { name: "Transparence", exact: true })).toHaveAttribute(
      "aria-orientation",
      "vertical",
    );
    await expect(page.locator(".color-sv-pad .react-colorful__hue")).toBeHidden();
    expect(await hue.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
    const native = await page.evaluate(() => ({
      secure: isSecureContext,
      available: typeof (window as Window & { EyeDropper?: unknown }).EyeDropper === "function",
    }));
    await expect(
      page.getByRole("button", { name: "Prélever une couleur à l’écran", exact: true }),
    ).toHaveCount(native.secure && native.available ? 1 : 0);
    const evidence = [];
    for (const channel of ["hue", "alpha"] as const) {
      const baseline = await state(page),
        before = await pixel(page, inspector),
        box = boxes[channel];
      const x = box.x + box.width / 2;
      await page.mouse.move(x, box.y + box.height * (channel === "hue" ? 0.1 : 0.5));
      await page.mouse.down();
      await page.mouse.move(x, box.y + box.height * (channel === "hue" ? 0.5 : 0.85), {
        steps: 12,
      });
      await presented(page, baseline.renderCount);
      const during = await state(page),
        after = await pixel(page, inspector);
      expect(during.fill).toBe(baseline.fill);
      expect(during.revision).toBe(baseline.revision);
      expect(during.commits).toEqual(baseline.commits);
      expect(during.uploads).toBe(baseline.uploads);
      expect(after).not.toEqual(before);
      if (channel === "hue") expect(after[1]!).toBeGreaterThan(before[1]! + 50);
      else expect(after[1]!).toBeGreaterThan(before[1]! + 40);
      await page.mouse.up();
      await expect.poll(async () => (await state(page)).revision).toBe(baseline.revision + 1);
      const committed = await state(page);
      expect(committed.undo).toBe(true);
      if (channel === "hue") expect(committed.fill).toMatch(/80$/);
      await page.evaluate(() => window.musart!.undo());
      await expect.poll(async () => (await state(page)).fill).toBe("#ff000080");
      expect((await state(page)).undo).toBe(false);
      await presented(page);
      expect(await pixel(page, inspector)).toEqual(before);
      evidence.push({
        channel,
        before,
        after,
        beforeRevision: baseline.revision,
        committedRevision: committed.revision,
        commits: during.commits,
      });
    }
    const beforeCancel = await state(page),
      hueBox = (await hue.boundingBox())!;
    await page.mouse.move(hueBox.x + hueBox.width / 2, hueBox.y + hueBox.height * 0.25);
    await page.mouse.down();
    await presented(page, beforeCancel.renderCount);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await presented(page);
    expect((await state(page)).revision).toBe(beforeCancel.revision);
    expect((await state(page)).undo).toBe(false);
    const alphaThumb = page.getByRole("slider", { name: "Transparence", exact: true });
    await alphaThumb.focus();
    await page.keyboard.down("ArrowUp");
    expect((await state(page)).fill).toBe("#ff000080");
    await page.keyboard.up("ArrowUp");
    await expect.poll(async () => (await state(page)).revision).toBe(beforeCancel.revision + 1);
    await page.evaluate(() => window.musart!.undo());
    expect((await state(page)).undo).toBe(false);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: "artifacts/screenshots/color-picker-dark.png" });
    const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
    expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/color-picker.json",
      JSON.stringify(
        {
          browser: page.context().browser()!.version(),
          nativeEyeDropper: { ...native, openedByTest: false },
          boxes,
          evidence,
          reads,
        },
        null,
        2,
      ),
    );
  } finally {
    await inspector.close();
  }
});
