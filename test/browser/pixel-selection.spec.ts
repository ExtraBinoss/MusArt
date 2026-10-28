import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";
async function ready(page: Page, nested = false) {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    for (const [index, color] of ["#d02030", "#d82838", "#2050e0"].entries()) {
      context.fillStyle = color;
      context.fillRect(index * 32, 0, 32, 64);
    }
    return canvas.toDataURL("image/png");
  });
  const project = createProject({
    pages: [
      createPage({
        id: "wand-page",
        width: 96,
        height: 64,
        background: "#00000000",
        layers: [
          ...(nested
            ? [
                createLayer("group", {
                  id: "wand-parent",
                  x: 0,
                  y: 0,
                  width: 96,
                  height: 64,
                  rotation: 30,
                }),
              ]
            : []),
          createLayer("image", {
            id: "wand-image",
            assetId: "wand-source",
            parentId: nested ? "wand-parent" : null,
            rotation: nested ? -30 : 0,
            x: 0,
            y: 0,
            width: 96,
            height: 64,
          }),
        ],
      }),
    ],
    assets: {
      "wand-source": {
        id: "wand-source",
        name: "Regions",
        mime: "image/png",
        width: 96,
        height: 64,
        dataUrl,
      },
    },
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  const board = page.locator('.canvas-artboard-editor[data-artboard-id="wand-page"]');
  await expect(board).toBeVisible();
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
    return (
      canvas?.dataset.pageId === "wand-page" &&
      canvas.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
  await page.getByRole("button", { name: "Baguette magique", exact: true }).click();
  const tolerance = page.getByRole("textbox", { name: "Tolérance", exact: true });
  await tolerance.fill("0");
  await tolerance.press("Enter");
  const bounds = (await board.boundingBox())!;
  return {
    project,
    left: { x: bounds.x + bounds.width / 6, y: bounds.y + bounds.height / 2 },
    right: { x: bounds.x + (bounds.width * 5) / 6, y: bounds.y + bounds.height / 2 },
  };
}
async function counters(page: Page) {
  return page
    .locator("[data-react-renders]")
    .evaluateAll((nodes) =>
      nodes.map((node) => [node.className, node.getAttribute("data-react-renders")]),
    );
}
function errors(page: Page) {
  const values: string[] = [];
  page.on("pageerror", (error) => values.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") values.push(message.text());
  });
  return values;
}
async function exportedPixels(page: Page, context: BrowserContext) {
  const url = await page.evaluate(() => window.musart!.render({ format: "png" })),
    inspector = await context.newPage();
  try {
    return await inspector.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return [16, 48, 80].map((x) => Array.from(context.getImageData(x, 32, 1, 1).data));
    }, url);
  } finally {
    await inspector.close();
  }
}
test("native wand drag shows retained marching ants, keeps the image intact and creates a mask only explicitly", async ({
  page,
  context,
}) => {
  const failures = errors(page),
    points = await ready(page),
    outline = page.getByTestId("pixel-selection-outline"),
    before = await page.evaluate(() => window.musart!.snapshot());
  await page.mouse.move(points.left.x, points.left.y);
  await page.mouse.down();
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  const commits = await counters(page);
  await page.mouse.move(points.left.x + 80, points.left.y, { steps: 12 });
  await expect(outline).toHaveAttribute("data-selection-pixels", "4096");
  expect(await counters(page)).toEqual(commits);
  await page.mouse.up();
  await expect(outline).toHaveAttribute("data-selection-dragging", "false");
  const selected = await page.evaluate(() => window.musart!.snapshot());
  expect(selected.project).toEqual(before.project);
  expect(selected.revision).toBe(before.revision);
  expect(selected.canUndo).toBe(false);
  await expect(outline.locator("path.pixel-selection-ants")).toHaveAttribute("d", /M/);
  await expect(outline.locator("path.pixel-selection-ants")).toHaveCSS(
    "animation-name",
    "pixel-selection-march",
  );
  await page.screenshot({ path: "artifacts/screenshots/wand-persistent-selection.png" });
  await page.getByRole("button", { name: "Garder la zone", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(before.revision + 1);
  const masked = await page.evaluate(() => window.musart!.snapshot());
  expect(masked.project.pages[0]!.layers[0]!.mask).toMatchObject({
    mode: "luminance",
    enabled: true,
    inverted: false,
  });
  expect(Object.keys(masked.project.assets)).toHaveLength(2);
  const pixels = await exportedPixels(page, context);
  expect(pixels[0]![3]).toBe(255);
  expect(pixels[1]![3]).toBe(255);
  expect(pixels[2]![3]).toBe(0);
  const tolerance = page.getByRole("textbox", { name: "Tolérance", exact: true });
  await tolerance.fill("0");
  await tolerance.press("Enter");
  await page.mouse.click(points.left.x, points.left.y);
  await expect(outline).toHaveAttribute("data-selection-dragging", "false");
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await page.keyboard.press("Delete");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(masked.revision + 1);
  const erased = await page.evaluate(() => window.musart!.snapshot());
  expect(erased.project.assets["wand-source"]).toEqual(before.project.assets["wand-source"]);
  expect(
    erased.project.pages[0]!.layers.find((layer) => layer.id === "wand-image")!.mask?.layerId,
  ).toBeTruthy();
  expect((await exportedPixels(page, context)).map((pixel) => pixel[3])).toEqual([0, 255, 0]);
  await page.evaluate(() => window.musart!.undo());
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(masked.project);
  await page.evaluate(() => window.musart!.undo());
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 2,
  });
  expect(failures).toEqual([]);
});
test("pixel shortcuts keep their layer and nested marching ants retain one screen-pixel stroke at every zoom", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const failures = errors(page),
    points = await ready(page, true),
    outline = page.getByTestId("pixel-selection-outline"),
    board = page.getByTestId("artboard");
  await page.mouse.click(points.left.x, points.left.y);
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await expect(outline).toHaveAttribute("data-selection-dragging", "false");
  const before = await page.evaluate(() => window.musart!.snapshot());
  await page.keyboard.press("Control+d");
  await expect(outline).not.toBeVisible();
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
  expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
  await page.mouse.click(points.left.x, points.left.y);
  await expect(outline).toHaveAttribute("data-selection-dragging", "false");
  const inspector = await context.newPage();
  try {
    await page.bringToFront();
    for (const zoom of [0.25, 1, 2, 4]) {
      await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
      const canvas = page.getByTestId("editor-canvas"),
        viewport = (await canvas.boundingBox())!;
      await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
      await zoomViewport(page, zoom);
      const bounds = (await board.boundingBox())!,
        edge = bounds.x + 32 * zoom,
        clip = {
          x: Math.floor(edge - 4),
          y: Math.floor(bounds.y + bounds.height / 2 - 4),
          width: 9,
          height: 8,
        },
        image = await page.screenshot({ clip, scale: "css" });
      const widths = await inspector.evaluate(
        async ({ dataUrl, edge, clipX }) => {
          const image = new Image();
          image.src = dataUrl;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          const data = context.getImageData(0, 0, image.width, image.height).data;
          return Array.from({ length: image.height }, (_, y) => {
            let changed = 0;
            for (let x = 0; x < image.width; x++) {
              const color = x + clipX + 0.5 < edge ? [208, 32, 48] : [216, 40, 56],
                offset = (y * image.width + x) * 4;
              if (color.some((value, channel) => Math.abs(data[offset + channel]! - value) > 35))
                changed++;
            }
            return changed;
          });
        },
        { dataUrl: `data:image/png;base64,${image.toString("base64")}`, edge, clipX: clip.x },
      );
      expect(Math.max(...widths)).toBeLessThanOrEqual(3);
      expect(Math.max(...widths)).toBeGreaterThan(0);
      const path = outline.locator(".pixel-selection-ants");
      await expect(path).toHaveAttribute("stroke-width", "1");
      await expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
      await expect(path).toHaveCSS("stroke-dasharray", "4px, 4px");
      await expect(path).toHaveCSS("animation-duration", "0.7s");
      expect(await outline.evaluate((element) => element.closest(".canvas-artboard"))).toBeNull();
      await page.screenshot({ path: `artifacts/screenshots/wand-outline-${zoom}.png` });
    }
  } finally {
    await inspector.close();
  }
  await page.keyboard.press("Backspace");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(before.revision + 1);
  expect(
    (await page.evaluate(() => window.musart!.snapshot())).project.pages[0]!.layers,
  ).toHaveLength(2);
  expect((await exportedPixels(page, context)).map((pixel) => pixel[3])).toEqual([0, 255, 255]);
  await page.evaluate(() => window.musart!.undo());
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 2,
  });
  expect(failures).toEqual([]);
});
test("native selection modifiers and Escape preserve the accepted region and reject a stale artboard gesture", async ({
  page,
}) => {
  const failures = errors(page),
    points = await ready(page),
    outline = page.getByTestId("pixel-selection-outline");
  await page.mouse.click(points.left.x, points.left.y);
  await expect(outline).toHaveAttribute("data-selection-dragging", "false");
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await page.mouse.move(points.right.x, points.right.y);
  await page.mouse.down();
  await page.mouse.move(points.right.x + 340, points.right.y);
  await expect(outline).toHaveAttribute("data-selection-pixels", "6144");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await page.keyboard.down("Shift");
  await page.mouse.click(points.right.x, points.right.y);
  await page.keyboard.up("Shift");
  await expect(outline).toHaveAttribute("data-selection-pixels", "4096");
  await page.keyboard.down("Alt");
  await page.mouse.click(points.left.x, points.left.y);
  await page.keyboard.up("Alt");
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await page.mouse.move(points.left.x, points.left.y);
  await page.mouse.down();
  await page.evaluate(
    (project) => window.musart!.load({ ...project, id: crypto.randomUUID() }),
    points.project,
  );
  await page.mouse.up();
  await expect(outline).not.toBeVisible();
  const snapshot = await page.evaluate(() => window.musart!.snapshot());
  expect(snapshot.canUndo).toBe(false);
  expect(snapshot.project.pages[0]!.layers[0]!.mask).toBeNull();
  expect(failures).toEqual([]);
});
