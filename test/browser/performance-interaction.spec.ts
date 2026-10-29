import { test, expect, type Locator, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, getWorldBounds } from "@musart/core";
import { inspectImage } from "./support/image-probe";
import { fitViewport } from "./support/viewport";

interface ContextProbe {
  webgpu: number;
  webgl: number;
  webgl2: number;
}
declare global {
  interface Window {
    __musartInteractionContexts?: ContextProbe;
  }
}
type Gesture = "color" | "opacity" | "effect";
const surfaces = [
  ".musart-app",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
  ".inspector",
] as const;
const imageRegion = { x: 0.25, y: 0.3, width: 0.5, height: 0.4 };

async function waitForPresented(page: Page, after?: number) {
  await page.waitForFunction(
    (after) => {
      const element = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
      if (!element) return false;
      const data = element.dataset;
      return (
        data.rendererReady === "true" &&
        data.sceneRevision === data.renderedRevision &&
        Number(data.renderCount) > 0 &&
        (after === undefined || Number(data.renderCount) > after)
      );
    },
    after,
    { timeout: 30000 },
  );
}
async function editorState(page: Page, kind: Gesture) {
  return page.evaluate(
    ({ kind, surfaces }) => {
      const snapshot = window.musart!.snapshot();
      const layer = snapshot.project.pages[0]!.layers.find(
        (layer) => layer.id === "gesture-shape",
      )!;
      const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
      const counts = Object.fromEntries(
        surfaces.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          const value = element?.dataset.reactRenders;
          if (!value || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
            throw new Error(`Missing actual React commit counter: ${selector}`);
          return [selector, Number(value)];
        }),
      );
      const stats = JSON.parse(canvas.dataset.gpuStats ?? "{}") as Record<string, number>;
      for (const key of ["uploads", "targets", "passes", "frames"])
        if (!Number.isFinite(stats[key])) throw new Error(`Missing GPU metric: ${key}`);
      const instances = Number(canvas.dataset.rendererInstances);
      if (!Number.isSafeInteger(instances) || instances < 1)
        throw new Error("Missing renderer instance counter");
      return {
        counts,
        stats,
        instances,
        contexts: { ...window.__musartInteractionContexts! },
        revision: snapshot.revision,
        canUndo: snapshot.canUndo,
        canRedo: snapshot.canRedo,
        value:
          kind === "color"
            ? layer.fill
            : kind === "opacity"
              ? layer.opacity
              : layer.effects[0]!.amount,
      };
    },
    { kind, surfaces: [...surfaces] },
  );
}
async function imageHash(page: Page, inspector: Page, region = imageRegion) {
  const canvas = page.locator(".canvas-artboard canvas");
  const result = await inspectImage(page, await canvas.screenshot(), [region], inspector);
  expect(result.width).toBeGreaterThan(100);
  expect(result.height).toBeGreaterThan(100);
  expect(result.regions[0]!.opaque).toBe(1);
  return result.regions[0]!.hash;
}
async function control(
  page: Page,
  kind: Gesture,
): Promise<{ locator: Locator; path: Array<{ x: number; y: number }> }> {
  if (kind === "color") {
    const locator = page.locator(".react-colorful__saturation .react-colorful__interactive");
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error("Color saturation control is not visible");
    return {
      locator,
      path: [
        { x: box.x + box.width * 0.3, y: box.y + box.height * 0.45 },
        { x: box.x + box.width * 0.7, y: box.y + box.height * 0.65 },
        { x: box.x + box.width * 0.85, y: box.y + box.height * 0.2 },
      ],
    };
  }
  if (kind === "effect")
    await page
      .locator(
        '[data-layer-id="gesture-shape"] [data-attachment-target="effect"][data-attachment-effect-id="gesture-effect"]',
      )
      .click();
  const locator =
    kind === "opacity"
      ? page.getByRole("button", { name: "Ajuster Opacité", exact: true })
      : page
          .locator(".layer-effect-details")
          .getByRole("button", { name: "Ajuster Intensité", exact: true });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Scrubbable numeric control is not visible");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return {
    locator,
    path: (kind === "opacity" ? [-40, -90, -140] : [-80, -180, -280]).map((distance) => ({
      x: start.x + distance,
      y: start.y,
    })),
  };
}

for (const { kind, large } of [
  { kind: "color", large: false },
  { kind: "opacity", large: false },
  { kind: "effect", large: false },
  { kind: "effect", large: true },
] as const) {
  test(`${kind}${large ? " (50 images)" : ""} live preview changes pixels with zero editor React commits before one undoable gesture commit`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const counts: ContextProbe = { webgpu: 0, webgl: 0, webgl2: 0 };
      window.__musartInteractionContexts = counts;
      const original = HTMLCanvasElement.prototype.getContext;
      const track = function (this: HTMLCanvasElement, id: string, ...args: unknown[]) {
        if (id === "webgpu" || id === "webgl" || id === "webgl2") counts[id]++;
        return Reflect.apply(original, this, [id, ...args]);
      };
      HTMLCanvasElement.prototype.getContext = track as HTMLCanvasElement["getContext"];
    });
    await page.goto(large ? "/?benchmark=50&automation=1" : "/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const shape = createLayer("rectangle", {
      id: "gesture-shape",
      name: "Gesture witness",
      x: 80,
      y: 50,
      width: 320,
      height: 220,
      fill: "#6699cc",
      opacity: 1,
      effects:
        kind === "effect"
          ? [createEffect("brightness", { id: "gesture-effect", amount: 0.5 })]
          : [],
    });
    const project = createProject({
      id: `gesture-project-${kind}`,
      name: `Live ${kind} preview`,
      pages: [
        createPage({
          id: "gesture-page",
          name: "Preview",
          width: 480,
          height: 320,
          background: "#f2f0eb",
          layers: [shape],
        }),
      ],
    });
    if (large) {
      await page.evaluate(
        (effect) => {
          const project = window.musart!.snapshot().project;
          const image = project.pages[0]!.layers.find((layer) => layer.kind === "image")!;
          image.id = "gesture-shape";
          image.name = "Live photo witness";
          image.effects = [effect];
          window.musart!.load(project);
          window.musart!.select([image.id]);
        },
        createEffect("brightness", { id: "gesture-effect", amount: 0.5 }),
      );
    } else
      await page.evaluate((project) => {
        window.musart!.load(project);
        window.musart!.select(["gesture-shape"]);
      }, project);
    if (large) await fitViewport(page);
    else await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
    let region = imageRegion;
    if (large) {
      const pageDocument = await page.evaluate(() => window.musart!.snapshot().project.pages[0]!);
      expect(pageDocument.layers.filter((layer) => layer.kind === "image")).toHaveLength(50);
      const bounds = getWorldBounds(pageDocument, "gesture-shape");
      region = {
        x: (bounds.x + bounds.width * 0.15) / pageDocument.width,
        y: (bounds.y + bounds.height * 0.15) / pageDocument.height,
        width: (bounds.width * 0.7) / pageDocument.width,
        height: (bounds.height * 0.7) / pageDocument.height,
      };
    }
    await waitForPresented(page);
    await page.evaluate(() => window.musart!.flushThumbnails());
    const inspector = await page.context().newPage();
    await page.bringToFront();
    try {
      const target = await control(page, kind);
      const box = await target.locator.boundingBox();
      if (!box) throw new Error("Gesture target disappeared");
      // Focus is established before the baseline; the isolated pixel inspector is already open.
      if (kind !== "color") await target.locator.focus();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const baseline = await editorState(page, kind);
      expect(baseline.canUndo).toBe(false);
      expect(baseline.contexts.webgpu + baseline.contexts.webgl2).toBeGreaterThan(0);
      const baselineHash = await imageHash(page, inspector, region);
      const hashes: number[] = [];
      const samples: Awaited<ReturnType<typeof editorState>>[] = [];
      await page.mouse.move(
        kind === "color" ? target.path[0]!.x : box.x + box.width / 2,
        kind === "color" ? target.path[0]!.y : box.y + box.height / 2,
      );
      await page.mouse.down();
      for (const point of target.path) {
        await page.mouse.move(point.x, point.y, { steps: 4 });
        await waitForPresented(page);
        const sample = await editorState(page, kind);
        expect(sample.counts).toEqual(baseline.counts);
        expect(sample.contexts).toEqual(baseline.contexts);
        expect(sample.instances).toBe(baseline.instances);
        expect(sample.stats.uploads).toBe(baseline.stats.uploads);
        expect(sample.stats.targets).toBe(baseline.stats.targets);
        expect(sample.value).toBe(baseline.value);
        expect(sample.revision).toBe(baseline.revision);
        expect(sample.canUndo).toBe(false);
        hashes.push(await imageHash(page, inspector, region));
        samples.push(sample);
        // Evaluating the already-open inspector must not blur or commit the held gesture.
        expect((await editorState(page, kind)).revision).toBe(baseline.revision);
      }
      expect(new Set(hashes).size).toBeGreaterThan(1);
      expect(hashes.at(-1)).not.toBe(baselineHash);
      await page.mouse.up();
      await expect
        .poll(async () => (await editorState(page, kind)).revision)
        .toBe(baseline.revision + 1);
      await waitForPresented(page);
      const committed = await editorState(page, kind);
      expect(committed.value).not.toBe(baseline.value);
      expect(committed.canUndo).toBe(true);
      expect(await imageHash(page, inspector, region)).toBe(hashes.at(-1));
      await page.evaluate(() => window.musart!.undo());
      await waitForPresented(page);
      const undone = await editorState(page, kind);
      expect(undone.value).toBe(baseline.value);
      expect(undone.canUndo).toBe(false);
      expect(undone.canRedo).toBe(true);
      expect(await imageHash(page, inspector, region)).toBe(baselineHash);
      await page.evaluate(() => window.musart!.redo());
      await waitForPresented(page);
      expect((await editorState(page, kind)).value).toBe(committed.value);
      expect(await imageHash(page, inspector, region)).toBe(hashes.at(-1));
      expect(errors).toEqual([]);
      await testInfo.attach(`live-${kind}-preview`, {
        body: JSON.stringify(
          { baseline, samples, committed, baselineHash, hashes, errors },
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      await page.mouse.up();
      await inspector.close();
    }
  });
}
