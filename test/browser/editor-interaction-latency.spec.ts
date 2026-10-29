import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  createLayerGeometryIndex,
  transformPoint,
  type Composition,
} from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { visibleThumbnailsReady } from "./support/selection-profile";

import {
  arm,
  result,
  instrumentGpu,
  startEditorTrace,
  editorDiagnostics,
  type ActionSample,
  type Point,
} from "./support/editor-action-probe";

interface Pick extends Point {
  id: string;
  pageId: string;
}

async function boardPoint(page: Page, pageId: string, point: Point) {
  const board = page.locator(`.canvas-artboard-backdrop[data-artboard-id="${pageId}"]`);
  return board.evaluate((node, point) => {
    const box = node.getBoundingClientRect(),
      element = node as HTMLElement;
    return {
      x: box.x + (point.x * box.width) / element.offsetWidth,
      y: box.y + (point.y * box.height) / element.offsetHeight,
    };
  }, point);
}
async function drawn(page: Page, pageId: string) {
  await page.waitForFunction((id) => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.pageId === id &&
      data.rendererReady === "true" &&
      data.sceneRevision === data.renderedRevision
    );
  }, pageId);
}
function textPick(composition: Composition): Pick {
  const index = createLayerGeometryIndex(composition);
  for (const layer of composition.layers.filter((item) => item.kind === "text")) {
    const point = transformPoint(index.worldMatrix(layer.id), {
      x: layer.width / 2,
      y: layer.height / 2,
    });
    if (
      index.isVisible(layer.id) &&
      !index.isLocked(layer.id) &&
      index.hitTest(point)?.id === layer.id
    )
      return { id: layer.id, pageId: composition.id, ...point };
  }
  throw new Error("AFTERHOURS has no selectable cold text witness");
}
function otherPick(composition: Composition, exclude: string): Pick {
  const index = createLayerGeometryIndex(composition);
  for (const y of [0.2, 0.4, 0.6, 0.8])
    for (const x of [0.2, 0.4, 0.6, 0.8]) {
      const point = { x: composition.width * x, y: composition.height * y },
        layer = index.hitTest(point);
      if (layer && layer.id !== exclude && !index.isLocked(layer.id))
        return { id: layer.id, pageId: composition.id, ...point };
    }
  throw new Error("AFTERHOURS has no second canvas target");
}

test("AFTERHOURS and two Dither images: native editor interactions remain independently responsive", async ({
  page,
  browser,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  await instrumentGpu(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let sequence = 0;
  const poster = createTechnoArtboard(() => `interaction-afterhours-${++sequence}`);
  const photoFiles = ["50-waterfall-5.jpg", "49-waterfall-4.jpg"];
  const bytes = await Promise.all(
    photoFiles.map((name) => readFile(`apps/web/public/benchmark/${name}`)),
  );
  const images = [
    createLayer("image", {
      id: "interaction-image-a",
      name: "Dither waterfall A",
      assetId: "interaction-photo-a",
      x: 80,
      y: 240,
      width: 420,
      height: 315,
      effects: [createEffect("dither", { id: "interaction-dither-a" })],
    }),
    createLayer("image", {
      id: "interaction-image-b",
      name: "Dither waterfall B",
      assetId: "interaction-photo-b",
      x: 560,
      y: 900,
      width: 420,
      height: 315,
      effects: [createEffect("dither", { id: "interaction-dither-b" })],
    }),
  ];
  const photos = createPage({
    id: "interaction-photos",
    name: "Two Dither photographs",
    width: 1080,
    height: 1920,
    rulers: true,
    layers: images,
  });
  const assets = Object.fromEntries(
    bytes.map((value, index) => {
      const id = index ? "interaction-photo-b" : "interaction-photo-a";
      return [
        id,
        {
          id,
          name: photoFiles[index]!,
          mime: "image/jpeg",
          width: 1280,
          height: 960,
          dataUrl: `data:image/jpeg;base64,${value.toString("base64")}`,
        },
      ];
    }),
  );
  const project = createProject({
    id: "actual-editor-interaction-latency",
    pages: [poster, photos],
    assets,
  });
  const cold = textPick(poster),
    warm = otherPick(poster, cold.id);
  const samples: ActionSample[] = [];
  let preparationMs = 0;
  let diagnosticTrace:
    | Awaited<ReturnType<Awaited<ReturnType<typeof startEditorTrace>>>>
    | { error: string } = null;
  const read = () => page.evaluate(() => window.musart!.snapshot());
  async function click(pick: Pick, action: string, waitForGpu = false) {
    const point = await boardPoint(page, pick.pageId, pick);
    await page.mouse.move(point.x, point.y);
    await arm(page, {
      action,
      event: "pointerdown",
      pageId: pick.pageId,
      selected: [pick.id],
      point,
      waitForGpu,
      menu: false,
    });
    await page.mouse.click(point.x, point.y);
    const sample = await result(page);
    samples.push(sample);
    expect((await read()).selection).toEqual([pick.id]);
    expect((await read()).pageId).toBe(pick.pageId);
    return sample;
  }
  try {
    await page.evaluate((project) => window.musart!.load(project), project);
    await drawn(page, poster.id);
    await page.bringToFront();
    // No preselection or font-control warmup: this is the first real text click.
    await click(cold, "cold-afterhours-text-selection");
    const prepStarted = performance.now();
    await page.evaluate(() => window.musart!.flushThumbnails());
    await visibleThumbnailsReady(page);
    preparationMs = performance.now() - prepStarted;
    const stopTrace = await startEditorTrace(
      page,
      `artifacts/editor-interaction-latency/${process.env.MUSART_SELECTION_COHORT ?? "candidate"}-warm-diagnostic`,
    );
    try {
      await click(warm, "warm-afterhours-canvas-selection");
    } finally {
      try {
        diagnosticTrace = await stopTrace();
      } catch (error) {
        diagnosticTrace = { error: String(error) };
      }
    }
    const posterIndex = createLayerGeometryIndex(poster);
    const allowed = poster.layers
      .filter(
        (layer) =>
          (layer.kind === "text" || layer.kind === "rectangle") && !posterIndex.isLocked(layer.id),
      )
      .map((layer) => layer.id);
    const layerPoint = await page.evaluate(
      ({ allowed, exclude }) => {
        const tree = document.querySelector<HTMLElement>(".layer-tree")!,
          bounds = tree.getBoundingClientRect();
        for (const row of tree.querySelectorAll<HTMLElement>(".layer-row[data-layer-id]")) {
          const id = row.dataset.layerId!,
            label = row.querySelector<HTMLElement>(".layer-name"),
            box = label?.getBoundingClientRect();
          if (
            id !== exclude &&
            allowed.includes(id) &&
            box &&
            box.top >= bounds.top &&
            box.bottom <= bounds.bottom
          )
            return { id, x: box.x + Math.min(24, box.width / 2), y: box.y + box.height / 2 };
        }
        throw new Error("No second visible native layer-row target");
      },
      { allowed, exclude: warm.id },
    );
    await page.mouse.move(layerPoint.x, layerPoint.y);
    await arm(page, {
      action: "afterhours-layer-selection",
      event: "click",
      pageId: poster.id,
      selected: [layerPoint.id],
      point: layerPoint,
    });
    await page.mouse.click(layerPoint.x, layerPoint.y);
    samples.push(await result(page));

    const beforeRulers = await read();
    await page.getByTestId("editor-canvas").focus();
    await expect(page.locator(".inspector-selection-boundary")).not.toHaveAttribute("disabled");
    for (const rulers of [!poster.rulers, Boolean(poster.rulers)]) {
      await arm(page, {
        action: rulers ? "ctrl-r-show-rulers" : "ctrl-r-hide-rulers",
        event: "keydown",
        pageId: poster.id,
        selected: beforeRulers.selection,
        rulers,
        observeInspectorDisabled: true,
      });
      await page.keyboard.press("ControlOrMeta+r");
      const rulerSample = await result(page);
      samples.push(rulerSample);
      expect(rulerSample.inspectorDisabledMutations).toEqual([]);
      expect((await read()).project.pages[0]!.rulers).toBe(rulers);
    }
    const afterRulers = await read();
    expect(afterRulers.selection).toEqual(beforeRulers.selection);
    expect(afterRulers.project.pages[0]!.rulers).toBe(Boolean(poster.rulers));

    // A native right down/up opens a usable menu without firing the item below the release.
    const contextRow = page.locator(`.layer-row[data-layer-id="${layerPoint.id}"] .layer-name`);
    const contextPoint = await contextRow.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x + Math.min(24, box.width / 2), y: box.y + box.height / 2 };
    });
    await page.mouse.move(contextPoint.x, contextPoint.y);
    await arm(page, {
      action: "native-context-menu-open-release",
      event: "contextmenu",
      pageId: poster.id,
      selected: [layerPoint.id],
      menu: true,
    });
    await page.mouse.down({ button: "right" });
    await page.mouse.up({ button: "right" });
    samples.push(await result(page));
    expect((await read()).project).toEqual(afterRulers.project);
    expect((await read()).revision).toBe(afterRulers.revision);
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: /^Dupliquer/ }).click();
    expect((await read()).project.pages[0]!.layers.length).toBe(poster.layers.length + 1);
    await page.getByRole("button", { name: "Annuler", exact: true }).click();
    expect((await read()).project).toEqual(afterRulers.project);
    await contextRow.click({ button: "right" });
    await expect(menu).toBeVisible();
    await click(cold, "outside-left-click-selects-and-dismisses-context-menu");
    await expect(menu).toHaveCount(0);

    const photoA: Pick = { id: images[0]!.id, pageId: photos.id, x: 290, y: 398 };
    const photoB: Pick = { id: images[1]!.id, pageId: photos.id, x: 770, y: 1058 };
    await click(photoA, "afterhours-to-dither-artboard", true);
    await click(photoB, "second-dither-image-selection");
    await click(cold, "dither-to-afterhours-artboard", true);
    await click(photoA, "return-to-dither-artboard", true);

    const beforeMarquee = await read();
    const start = await boardPoint(page, photos.id, { x: 20, y: 160 });
    await page.mouse.click(start.x, start.y);
    await expect.poll(async () => (await read()).selection).toEqual([]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: "right" });
    const marqueeSteps = [
      { local: { x: 520, y: 620 }, selected: [photoA.id], action: "held-marquee-one-image" },
      {
        local: { x: 1040, y: 1260 },
        selected: [photoA.id, photoB.id],
        action: "held-marquee-two-images",
      },
      {
        local: { x: 22, y: 161 },
        selected: [],
        action: "held-marquee-shrinks-within-start-threshold",
      },
      {
        local: { x: 1040, y: 1260 },
        selected: [photoA.id, photoB.id],
        action: "held-marquee-reextends-to-two-images",
      },
    ];
    for (const { local, selected, action } of marqueeSteps) {
      const point = await boardPoint(page, photos.id, local);
      await arm(page, {
        action,
        event: "pointermove",
        pageId: photos.id,
        selected: [...selected],
        point,
        marquee: true,
        waitForInspector: false,
      });
      await page.mouse.move(point.x, point.y, { steps: 3 });
      samples.push(await result(page));
      await expect(page.locator(".canvas-marquee")).toBeVisible();
      for (const id of selected)
        await expect(page.locator(`.canvas-selection[data-layer-id="${id}"]`)).toBeVisible();
      if (!selected.length) {
        expect(Math.hypot(point.x - start.x, point.y - start.y)).toBeLessThan(3);
        await expect(page.locator(".canvas-selection[data-layer-id]")).toHaveCount(0);
        const box = (await page.locator(".canvas-marquee").boundingBox())!;
        expect(box.width).toBeLessThan(3);
        expect(box.height).toBeLessThan(3);
      }
    }
    await arm(page, {
      action: "marquee-release",
      event: "pointerup",
      pageId: photos.id,
      selected: [photoA.id, photoB.id],
      marquee: false,
    });
    await page.mouse.up({ button: "right" });
    samples.push(await result(page));
    const released = await read();
    expect([...released.selection].sort()).toEqual([photoA.id, photoB.id].sort());
    expect(released.project).toEqual(beforeMarquee.project);
    expect(released.revision).toBe(beforeMarquee.revision);
    expect(released.canUndo).toBe(beforeMarquee.canUndo);
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    await mkdir("artifacts/editor-interaction-latency", { recursive: true });
    await page.screenshot({
      path: "artifacts/editor-interaction-latency/live-selection-witness.png",
    });
    expect(pageErrors).toEqual([]);
  } finally {
    const finalDiagnostics = await editorDiagnostics(page);
    const environment = await page.evaluate(async () => {
      const info = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : null;
      return {
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        backend: document.querySelector(".editor-gpu-scene canvas")?.getAttribute("data-backend"),
        adapter: info
          ? {
              vendor: info.vendor,
              architecture: info.architecture,
              device: info.device,
              description: info.description,
              isFallbackAdapter: info.isFallbackAdapter,
            }
          : null,
        reads: window.__musartVideoReadbacks,
      };
    });
    await mkdir("artifacts/editor-interaction-latency", { recursive: true });
    const reportPath = `artifacts/editor-interaction-latency/${process.env.MUSART_SELECTION_COHORT ?? "candidate"}.json`;
    const report = {
      fixture: {
        template: poster.name,
        posterLayers: poster.layers.length,
        imageLayers: 2,
        ditherEffects: 2,
        sources: photoFiles.map((file, index) => ({
          file,
          sha256: createHash("sha256").update(bytes[index]!).digest("hex"),
        })),
      },
      browser: browser.version(),
      environment,
      preparationMs,
      samples,
      pageErrors,
      finalDiagnostics,
      diagnosticTrace,
      boundary:
        "Generated/capture clocks to first RAF with useful DOM; second RAF is a presentation opportunity. Inspector and actual canonical page GPU readiness are separate. GPU queue sources are identified through configured canvas/device queues; shared/unknown sources remain explicit. No physical-latency, INP or 60fps claim is inferred from these clocks.",
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await page.evaluate(() => {
      window.__editorActionProbe?.cancel?.();
      window.__editorGpuProbe?.restore();
      delete window.__editorActionProbe;
      delete window.__editorGpuProbe;
    });
  }
});
