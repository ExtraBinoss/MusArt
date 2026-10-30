import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function state(page: Page) {
  return page.evaluate(() => {
    const snapshot = window.musart!.snapshot(),
      layers = snapshot.project.pages[0]!.layers,
      canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
    return {
      projectId: snapshot.project.id,
      revision: snapshot.revision,
      canUndo: snapshot.canUndo,
      fill: layers.find((layer) => layer.id === "solid")!.fill,
      gradient: layers.find((layer) => layer.id === "gradient")!.fillGradient!,
      renders: Number(canvas.dataset.renderCount),
      counts: Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => {
            const value = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
            if (!value || Number(value) < 1) throw new Error(`Missing React counter: ${selector}`);
            return [selector, Number(value)];
          },
        ),
      ),
    };
  });
}
async function presented(page: Page, after = -1) {
  await page.waitForFunction((after) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision &&
      Number(canvas.dataset.renderCount) > after
    );
  }, after);
}

test("native color and gradient thumbs keep the final sample, one undo and durable values", async ({
  page,
}, info) => {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["solid"]);
    },
    createProject({
      id: "color-gradient-release",
      pages: [
        createPage({
          width: 640,
          height: 420,
          layers: [
            createLayer("rectangle", {
              id: "solid",
              x: 30,
              y: 30,
              width: 200,
              height: 160,
              fill: "#ff000080",
            }),
            createLayer("text", {
              id: "gradient",
              x: 250,
              y: 100,
              width: 350,
              height: 200,
              text: "MusArt",
              fontSize: 72,
              fillGradient: {
                kind: "linear",
                angle: 0,
                stops: [
                  { offset: 0, color: "#ff0000" },
                  { offset: 0.5, color: "#00ff00" },
                  { offset: 1, color: "#0000ff" },
                ],
              },
            }),
          ],
        }),
      ],
    }),
  );
  await presented(page);
  await page.evaluate(() => window.musart!.flushThumbnails());
  const evidence: unknown[] = [];
  for (const channel of ["hue", "alpha", "sv"] as const) {
    const control = page.locator(channel === "sv" ? ".color-sv-pad" : `.color-${channel}`);
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!,
      before = await state(page),
      canvas = page.locator(".canvas-artboard canvas"),
      original = await canvas.screenshot();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width * (channel === "sv" ? 0.8 : 0.5),
      box.y + box.height * 0.7,
      { steps: 8 },
    );
    await presented(page, before.renders);
    const draft = (
        await page.getByLabel("Couleur hexadécimale", { exact: true }).inputValue()
      ).toLowerCase(),
      during = await state(page);
    expect(draft).not.toBe(before.fill);
    expect(during.fill).toBe(before.fill);
    expect(during.revision).toBe(before.revision);
    expect(during.counts).toEqual(before.counts);
    expect(await canvas.screenshot()).not.toEqual(original);
    await page.mouse.up();
    await expect.poll(async () => (await state(page)).fill).toBe(draft);
    expect((await state(page)).revision).toBe(before.revision + 1);
    await page.evaluate(() => window.musart!.undo());
    await expect.poll(async () => (await state(page)).fill).toBe(before.fill);
    await presented(page);
    expect((await state(page)).canUndo).toBe(false);
    evidence.push({ channel, draft });
  }
  await page.evaluate(() => window.musart!.redo());
  await page.evaluate(() => window.musart!.select(["gradient"]));
  const thumb = page.getByRole("slider", { name: "Point 2", exact: true });
  await thumb.scrollIntoViewIfNeeded();
  const box = (await thumb.boundingBox())!,
    ramp = (await page.getByRole("img", { name: "Aperçu du dégradé" }).boundingBox())!,
    before = await state(page),
    grabX = box.x + box.width / 2 + 6,
    y = box.y + box.height / 2;
  await thumb.evaluate((node) => {
    node.addEventListener(
      "pointerdown",
      (event) => {
        node.dataset.nativeStartX = String((event as PointerEvent).clientX);
      },
      { once: true },
    );
    node.addEventListener(
      "pointerup",
      (event) => {
        node.dataset.nativeEndX = String((event as PointerEvent).clientX);
      },
      { once: true },
    );
  });
  await page.mouse.move(grabX, y);
  await page.mouse.down();
  await page.mouse.move(grabX + ramp.width * 0.1, y, { steps: 6 });
  const during = await state(page);
  expect(during.counts).toEqual(before.counts);
  expect(during.gradient).toEqual(before.gradient);
  expect(during.revision).toBe(before.revision);
  const native = await page.context().newCDPSession(page);
  try {
    // Deliberately deliver a newer release sample than the last pointermove.
    await native.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: grabX + ramp.width * 0.25,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    await native.detach();
    await page.mouse.up();
  }
  const expected =
    0.5 +
    (Number(await thumb.getAttribute("data-native-end-x")) -
      Number(await thumb.getAttribute("data-native-start-x"))) /
      ramp.width;
  await expect
    .poll(async () => (await state(page)).gradient.stops[1]!.offset)
    .toBeCloseTo(expected, 10);
  const saved = await state(page);
  expect(saved.revision).toBe(before.revision + 1);
  await page.evaluate(() => window.musart!.undo());
  expect((await state(page)).gradient).toEqual(before.gradient);
  expect((await state(page)).canUndo).toBe(before.canUndo);
  await page.evaluate(async () => {
    window.musart!.redo();
    await window.musart!.save();
  });
  const readsBeforeReload = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect(readsBeforeReload).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, canvasHook: true });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  await presented(page);
  await expect.poll(async () => (await state(page)).projectId).toBe("color-gradient-release");
  expect((await state(page)).gradient).toEqual(saved.gradient);
  expect((await state(page)).fill).toEqual(saved.fill);
  await page.evaluate(() => window.musart!.select(["gradient"]));
  await expect(page.getByRole("slider", { name: "Point 2", exact: true })).toHaveAttribute(
    "aria-valuenow",
    String(expected * 100),
  );
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, canvasHook: true });
  await info.attach("color-gradient-release", {
    body: JSON.stringify({ evidence, expected, saved, readsBeforeReload, reads }),
    contentType: "application/json",
  });
});
