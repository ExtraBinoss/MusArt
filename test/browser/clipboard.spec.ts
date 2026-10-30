import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
}
async function search(page: Page, label: string) {
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Rechercher dans Melt", exact: true });
  await dialog.getByRole("combobox").fill(label);
  await dialog.getByRole("option", { name: new RegExp(`^${label}`) }).click();
  await expect(page.locator("[data-magic-search]")).toHaveCount(0);
}
/** Native PNG decode is isolated from the editor's production readback instrumentation. */
async function decodedPixels(
  page: Page,
  images: { url: string; points: { x: number; y: number }[] }[],
) {
  const inspector = await page.context().newPage();
  try {
    return await inspector.evaluate(async (images) => {
      const witnesses: { width: number; height: number; pixels: number[][] }[] = [];
      for (const { url, points } of images) {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        witnesses.push({
          width: image.width,
          height: image.height,
          pixels: points.map(({ x, y }) => [
            ...context.getImageData(Math.round(x), Math.round(y), 1, 1).data,
          ]),
        });
      }
      return witnesses;
    }, images);
  } finally {
    await inspector.close();
    await page.bringToFront();
  }
}

test("native clipboard transfers editable masked groups and originals between artboards and projects at the pointer", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 64, 64);
    gradient.addColorStop(0, "#00d4e5");
    gradient.addColorStop(1, "#f0389e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/png");
  });
  const group = createLayer("group", {
    id: "clipboard-group",
    name: "Editable group",
    x: 40,
    y: 60,
    width: 160,
    height: 120,
    effects: [createEffect("brightness", { id: "clipboard-effect", amount: 0.55 })],
  });
  const mask = createLayer("rectangle", {
    id: "clipboard-mask",
    maskSource: true,
    x: 50,
    y: 80,
    width: 50,
    height: 80,
    fill: "#ffffff",
  });
  const image = createLayer("image", {
    id: "clipboard-image",
    name: "Portable image",
    parentId: group.id,
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    assetId: "clipboard-original",
    mask: { layerId: mask.id, enabled: true, inverted: false, mode: "alpha" },
  });
  const first = createPage({
    id: "clipboard-first",
    name: "Source",
    width: 400,
    height: 300,
    layers: [mask, group, image],
    background: "#123456",
  });
  const second = createPage({
    id: "clipboard-second",
    name: "Destination",
    width: 400,
    height: 300,
    background: "#223344",
  });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "clipboard-project",
      name: "Clipboard studio",
      pages: [first, second],
      assets: {
        "clipboard-original": {
          id: "clipboard-original",
          name: "Gradient",
          mime: "image/png",
          width: 64,
          height: 64,
          dataUrl,
        },
      },
    }),
  );
  await ready(page);
  const sourcePng = await page.evaluate(() => window.musart!.render({ format: "png", scale: 1 }));
  await page.evaluate((id) => window.musart!.select([id]), group.id);
  await page.getByTestId("editor-canvas").focus();
  await page.keyboard.press("Control+c");
  const nativeText = await page.evaluate(() => navigator.clipboard.readText());
  const payload = JSON.parse(nativeText);
  expect(payload).toMatchObject({
    format: "musart.clipboard",
    version: 1,
    kind: "selection",
    selection: [group.id],
  });
  expect(payload.document.assets["clipboard-original"].dataUrl).toBe(dataUrl);
  await page.locator(`.artboard-heading[data-artboard-id="${second.id}"] .artboard-name`).click();
  await ready(page);
  const board = (await page.getByTestId("artboard").boundingBox())!;
  await page.mouse.move(board.x + board.width * 0.45, board.y + board.height * 0.6);
  await page.getByTestId("editor-canvas").focus();
  const before = await page.evaluate(() => window.musart!.snapshot());
  await page.keyboard.press("Control+v");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[1]!.layers.length))
    .toBe(3);
  await ready(page);
  const pasted = await page.evaluate(() => window.musart!.snapshot());
  const clonedGroup = pasted.project.pages[1]!.layers.find((layer) => layer.kind === "group")!;
  const clonedImage = pasted.project.pages[1]!.layers.find((layer) => layer.kind === "image")!;
  expect(clonedGroup.id).not.toBe(group.id);
  expect(clonedGroup.x).toBeCloseTo(100, 1);
  expect(clonedGroup.y).toBeCloseTo(120, 1);
  expect(clonedGroup.effects[0]!.id).not.toBe("clipboard-effect");
  expect(clonedImage.parentId).toBe(clonedGroup.id);
  expect(
    pasted.project.pages[1]!.layers.some(
      (layer) => layer.id === clonedImage.mask!.layerId && layer.maskSource,
    ),
  ).toBe(true);
  expect(pasted.selection).toEqual([clonedGroup.id]);
  expect(pasted.revision).toBe(before.revision + 1);
  const destinationPng = await page.evaluate(() =>
    window.musart!.render({ format: "png", scale: 1 }),
  );
  const sourcePoints = [
    { x: 60, y: 95 },
    { x: 75, y: 120 },
    { x: 90, y: 145 },
    { x: 125, y: 120 },
  ];
  const pixels = await decodedPixels(page, [
    { url: sourcePng, points: sourcePoints },
    {
      url: destinationPng,
      points: sourcePoints.map(({ x, y }) => ({
        x: x + clonedGroup.x - group.x,
        y: y + clonedGroup.y - group.y,
      })),
    },
  ]);
  for (const witness of pixels) expect(witness).toMatchObject({ width: 400, height: 300 });
  // The three opaque gradient witnesses retain the real image/effect output.
  // A fourth point lies inside the image bounds but outside its copied mask.
  for (let index = 0; index < 3; index++) {
    const source = pixels[0]!.pixels[index]!,
      destination = pixels[1]!.pixels[index]!;
    expect(source[3]).toBe(255);
    expect(destination[3]).toBe(255);
    expect(Math.max(...source.slice(0, 3))).toBeGreaterThan(100);
    for (let channel = 0; channel < 3; channel++)
      expect(Math.abs(source[channel]! - destination[channel]!)).toBeLessThanOrEqual(3);
  }
  expect(new Set(pixels[0]!.pixels.slice(0, 3).map((pixel) => pixel.join(","))).size).toBe(3);
  expect(pixels[0]!.pixels[3]).toEqual([18, 52, 86, 255]);
  expect(pixels[1]!.pixels[3]).toEqual([34, 51, 68, 255]);
  await page.getByTestId("editor-canvas").focus();
  await page.keyboard.press("Control+z");
  expect((await page.evaluate(() => window.musart!.snapshot())).project.pages[1]!.layers).toEqual(
    [],
  );
  await page.keyboard.press("Control+Shift+z");
  await ready(page);
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/clipboard-cross-artboard.png" });
  // Copy a full composition through its real registered search action, then paste
  // that OS clipboard text into an independent project as a new editable artboard.
  await search(page, "Copier la composition en JSON modifiable");
  await expect
    .poll(async () =>
      page.evaluate(async () => JSON.parse(await navigator.clipboard.readText()).kind),
    )
    .toBe("composition");
  const composition = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(composition.kind).toBe("composition");
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "clipboard-foreign",
      pages: [createPage({ id: "foreign-cover", width: 400, height: 300 })],
    }),
  );
  await ready(page);
  await page.getByTestId("editor-canvas").focus();
  await page.keyboard.press("Control+v");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
    .toBe(2);
  await ready(page);
  const foreign = await page.evaluate(() => window.musart!.snapshot());
  expect(foreign.project.pages[1]).toMatchObject({
    background: second.background,
    width: 400,
    height: 300,
  });
  expect(foreign.project.pages[1]!.layers).toHaveLength(3);
  expect(Object.values(foreign.project.assets)[0]!.dataUrl).toBe(dataUrl);
  expect(Object.keys(foreign.project.assets)[0]).not.toBe("clipboard-original");
  expect(foreign.pageId).toBe(foreign.project.pages[1]!.id);
  await page.keyboard.press("Control+z");
  expect((await page.evaluate(() => window.musart!.snapshot())).project.pages).toHaveLength(1);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
  await writeFile(
    "artifacts/clipboard-native.json",
    JSON.stringify(
      {
        nativeFormat: payload.format,
        copiedOriginalBytes: dataUrl.length,
        beforeRevision: before.revision,
        pastedRevision: pasted.revision,
        clonedGroup,
        foreignPageCount: foreign.project.pages.length,
        pixels,
        errors,
      },
      null,
      2,
    ),
  );
});

test("clipboard shortcuts are editable and persist while native text editing remains available", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layer = createLayer("rectangle", { id: "remapped-copy", width: 80, height: 60 });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "remapped-clipboard",
      pages: [createPage({ layers: [layer], width: 400, height: 300 })],
    }),
  );
  await ready(page);
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Raccourcis clavier", exact: true });
  await dialog.getByRole("searchbox").fill("Copier les éléments sélectionnés");
  const copy = dialog.locator('[data-binding-command="action:copy"]');
  await copy
    .getByRole("button", {
      name: "Modifier le raccourci de Copier les éléments sélectionnés",
      exact: true,
    })
    .click();
  await page.keyboard.press("Control+Alt+c");
  await expect(copy).toContainText("Alt");
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.evaluate((id) => window.musart!.select([id]), layer.id);
  await page.getByTestId("editor-canvas").focus();
  await page.keyboard.press("Control+Alt+c");
  await expect
    .poll(() =>
      page.evaluate(async () => JSON.parse(await navigator.clipboard.readText()).selection),
    )
    .toEqual([layer.id]);
  await page.keyboard.press("Control+v");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(2);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("musart.keybindings.v1")!),
  );
  expect(stored.overrides["action:copy"]).toEqual([
    { key: "c", mod: true, alt: true, shift: false },
  ]);
  await page.evaluate(() => window.musart!.save());
  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("musart.keybindings.v1")!).overrides["action:copy"],
    ),
  ).toEqual(stored.overrides["action:copy"]);
  // A focused search input keeps browser-native copy/paste, despite the editor's
  // portable document selection and remapped command bindings.
  await page.keyboard.press("Control+k");
  const searchInput = page
    .getByRole("dialog", { name: "Rechercher dans Melt", exact: true })
    .getByRole("combobox");
  await searchInput.fill("Native text stays editable");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Native text stays editable",
  );
  await searchInput.fill("");
  await page.keyboard.press("Control+v");
  await expect(searchInput).toHaveValue("Native text stays editable");
});
