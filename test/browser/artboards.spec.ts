import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";

async function presented(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
}
async function pose(page: Page) {
  return page
    .getByTestId("artboard")
    .evaluate((board) => [board.dataset.panX, board.dataset.panY, board.dataset.zoom]);
}
async function center(page: Page, id: string, x: number, y: number) {
  const board = page.locator(`.canvas-artboard-backdrop[data-artboard-id="${id}"]`),
    box = (await board.boundingBox())!;
  const dimensions = await board.evaluate((element) => ({
    width: (element as HTMLElement).offsetWidth,
    height: (element as HTMLElement).offsetHeight,
  }));
  return {
    x: box.x + (x * box.width) / dimensions.width,
    y: box.y + (y * box.height) / dimensions.height,
  };
}

test("real artboards share one GPU scene, preserve world navigation and retain local editing/thumbnail lifecycles", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext,
      contexts = new WeakSet<object>();
    const evidence = { count: 0 };
    (window as Window & { __artboardContexts?: typeof evidence }).__artboardContexts = evidence;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      const context = Reflect.apply(original, this, [kind, ...args]) as object | null;
      if (
        context &&
        (kind === "webgpu" || kind === "webgl2" || kind === "webgl") &&
        !contexts.has(context)
      ) {
        contexts.add(context);
        evidence.count++;
      }
      return context;
    } as typeof original;
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const cover = createPage({
    id: "artboard-cover",
    name: "Cover",
    width: 320,
    height: 240,
    background: "#112233",
    rulers: true,
    layers: [
      createLayer("rectangle", {
        id: "cover-card",
        name: "Cover card",
        x: 24,
        y: 24,
        width: 272,
        height: 192,
        fill: "#f5b942",
        radius: 16,
      }),
      createLayer("text", {
        id: "cover-title",
        name: "Cover title",
        x: 40,
        y: 64,
        width: 240,
        height: 120,
        text: "MAKE\nSOMETHING.",
        fontSize: 30,
        fontWeight: 750,
        fill: "#112233",
      }),
    ],
  });
  const story = createPage({
    id: "artboard-story",
    name: "Story",
    width: 320,
    height: 240,
    background: "#334455",
    rulers: true,
    layers: [
      createLayer("ellipse", {
        id: "story-orb",
        name: "Story orb",
        x: 60,
        y: 40,
        width: 140,
        height: 140,
        fill: "#739bff",
      }),
    ],
  });
  const poster = createPage({
    id: "artboard-poster",
    name: "Poster",
    width: 240,
    height: 320,
    background: "#e6dfd1",
    layers: [
      createLayer("text", {
        id: "poster-title",
        name: "Poster title",
        x: 20,
        y: 30,
        width: 200,
        height: 90,
        text: "CREATE\nTOGETHER",
        fontSize: 28,
        fontWeight: 700,
        fill: "#112233",
      }),
      createLayer("rectangle", {
        id: "poster-square",
        x: 20,
        y: 150,
        width: 200,
        height: 150,
        fill: "#ed7a60",
        radius: 12,
      }),
    ],
  });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ name: "Artboard workspace", pages: [cover, story, poster] }),
  );
  await presented(page);
  await page.evaluate(async () => {
    await window.musart!.save();
    await window.musart!.flushThumbnails();
  });
  const inactive = page.locator(".canvas-artboard-inactive"),
    active = page.getByTestId("artboard"),
    canvas = page.getByTestId("editor-canvas");
  await expect(inactive).toHaveCount(2);
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveCount(1);
  await expect(
    page.locator('.canvas-artboard-inactive[data-artboard-id="artboard-story"] img'),
  ).toBeVisible();
  await expect(
    page.locator('.canvas-artboard-inactive[data-artboard-id="artboard-poster"] img'),
  ).toBeVisible();
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>(".canvas-artboard-inactive img")].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  const inspector = await page.context().newPage();
  try {
    const thumbnailUrl = await page
      .locator('.canvas-artboard-inactive[data-artboard-id="artboard-story"] img')
      .evaluate(async (image) => {
        const blob = await fetch((image as HTMLImageElement).src).then((response) =>
          response.blob(),
        );
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new TypeError("Expected an encoded thumbnail URL"));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      });
    const thumbnail = await inspector.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        pixel: [...context.getImageData(0, 0, 1, 1).data],
      };
    }, thumbnailUrl);
    expect(thumbnail.width / thumbnail.height).toBeCloseTo(320 / 240, 2);
    expect(thumbnail.pixel[3]).toBe(255);
    for (const [index, channel] of [51, 68, 85].entries())
      expect(Math.abs(thumbnail.pixel[index]! - channel)).toBeLessThanOrEqual(2);
    await active.locator("canvas").evaluate((element) => {
      (element as HTMLElement).dataset.artboardWitness = "retained";
    });
    const baseline = await page.evaluate(() => ({
      contexts: (window as Window & { __artboardContexts?: { count: number } }).__artboardContexts!
        .count,
      revision: window.musart!.snapshot().revision,
    }));
    const oldBox = (await page
      .locator('.canvas-artboard-inactive[data-artboard-id="artboard-story"]')
      .boundingBox())!;
    await canvas.hover({ position: { x: 600, y: 300 } });
    await page.mouse.wheel(80, 40);
    const movedBox = (await page
      .locator('.canvas-artboard-inactive[data-artboard-id="artboard-story"]')
      .boundingBox())!;
    expect(movedBox.x - oldBox.x).toBeCloseTo(-40, 3);
    expect(movedBox.y - oldBox.y).toBeCloseTo(-20, 3);
    const retainedPose = await pose(page),
      target = await center(page, story.id, 100, 90);
    await page.mouse.click(target.x, target.y);
    await presented(page);
    await expect(active).toHaveAttribute("data-artboard-id", story.id);
    expect(await pose(page)).toEqual(retainedPose);
    expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual(["story-orb"]);
    await expect(active.locator("canvas")).toHaveAttribute("data-artboard-witness", "retained");
    for (const id of [cover.id, poster.id, story.id]) {
      await page.locator(`.artboard-heading[data-artboard-id="${id}"] .artboard-name`).click();
      await presented(page);
      expect(await pose(page)).toEqual(retainedPose);
      await expect(active.locator("canvas")).toHaveAttribute("data-artboard-witness", "retained");
    }
    const warm = await page.evaluate((id) => {
      const output = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!;
      const backdrop = document.querySelector<HTMLImageElement>(
        `.canvas-artboard-backdrop[data-artboard-id="${id}"] img`,
      )!;
      const before = JSON.parse(output.dataset.gpuStats!);
      window.musart!.page(id);
      return {
        beforePasses: before.passes,
        afterPasses: JSON.parse(output.dataset.gpuStats!).passes,
        ready: output.dataset.rendererReady,
        prepared: output.dataset.compositionPrepared,
        initialized: output.dataset.displayInitialized,
        visibility: output.style.visibility,
        backdropDecoded: backdrop.complete && backdrop.naturalWidth > 0,
        backdropRetained: backdrop.isConnected,
        loader: getComputedStyle(document.querySelector(".canvas-loading")!).visibility,
      };
    }, cover.id);
    expect(warm).toMatchObject({
      ready: "false",
      prepared: "true",
      initialized: "true",
      visibility: "hidden",
      backdropDecoded: true,
      backdropRetained: true,
      loader: "hidden",
    });
    expect(warm.afterPasses).toBe(warm.beforePasses);
    await presented(page);
    await expect(active.locator("canvas")).toHaveCSS("visibility", "visible");
    await page.locator(`.artboard-heading[data-artboard-id="${story.id}"] .artboard-name`).click();
    await presented(page);
    await expect(page.locator(".artboard-preview-state")).toHaveCount(0);
    expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(baseline.revision);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __artboardContexts?: { count: number } }).__artboardContexts!.count,
      ),
    ).toBe(baseline.contexts);
    const from = await center(page, story.id, 100, 90);
    await page.keyboard.down("Alt");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + 20, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[1]!.layers[0]!.x))
      .toBe(90);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[1]!.layers[0]!.y),
    ).toBe(60);
    await page.keyboard.press("Control+z");
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[1]!.layers[0]!.x))
      .toBe(60);
    const ruler = page.getByLabel("Règle verticale : glisser pour ajouter un repère vertical"),
      rulerBox = (await ruler.boundingBox())!,
      guideTarget = await center(page, story.id, 63, 100);
    await page.mouse.move(rulerBox.x + rulerBox.width / 2, guideTarget.y);
    await page.mouse.down();
    await page.mouse.move(guideTarget.x, guideTarget.y, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(() =>
        page.evaluate(() => window.musart!.snapshot().project.pages[1]!.guides[0]?.position),
      )
      .toBeCloseTo(63, 1);
    await page
      .locator('.artboard-heading[data-artboard-id="artboard-story"] .artboard-name')
      .dblclick();
    const name = page.getByLabel("Nom du plan de travail", { exact: true });
    await name.fill("Story revised");
    await name.press("Enter");
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[1]!.name))
      .toBe("Story revised");
    await canvas.hover({ position: { x: 600, y: 300 } });
    await zoomViewport(page, 0.75);
    await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
    await expect(active).toHaveAttribute("data-zoom", "1");
    await expect(active).toHaveAttribute("data-pan-x", "0");
    await page.screenshot({ path: "artifacts/screenshots/artboard-workspace.png" });
    const beforeAdd = await page.evaluate(() => window.musart!.snapshot().project.pages.length);
    await page.locator('.artboard-heading[data-active="true"]').hover();
    await page.getByTestId("canvas-add-artboard").click();
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
      .toBe(beforeAdd + 1);
    const added = await page.evaluate(() => window.musart!.snapshot().project.pages.at(-1)!);
    await page
      .getByRole("button", { name: `Options du plan de travail : ${added.name}`, exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Supprimer", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
      .toBe(beforeAdd);
    const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
    expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(errors).toEqual([]);
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/artboard-workspace.json",
      JSON.stringify(
        {
          browser: page.context().browser()!.version(),
          baseline,
          thumbnail,
          retainedPose,
          warm,
          reads,
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await inspector.close();
  }
});

test("artboard headings remain disjoint during animated extreme zoom and move dimensions into compact menus", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const boards = [160, 280, 90, 400, 120, 200].map((width, index) =>
    createPage({
      id: `crowded-${index}`,
      name: `A very long artboard name ${index + 1}`,
      width,
      height: [220, 100, 300, 140, 160, 320][index]!,
      background: ["#f3b743", "#739bff", "#ed7a60"][index % 3]!,
    }),
  );
  await page.evaluate((project) => window.musart!.load(project), createProject({ pages: boards }));
  await presented(page);
  const canvas = page.getByTestId("editor-canvas"),
    active = page.getByTestId("artboard");
  await canvas.hover({ position: { x: 500, y: 400 } });
  await zoomViewport(page, 0.05);
  await expect(active).toHaveAttribute("data-view-moving", "false");
  await expect(page.locator(".workspace-dimensions")).toHaveCount(0);
  const baseline = await page.evaluate(() =>
    Object.fromEntries(
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => [
          selector,
          Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
        ],
      ),
    ),
  );
  const sampling = page.evaluate(
    () =>
      new Promise<{ moving: boolean; collisions: number; commits: Record<string, number> }[]>(
        (resolve) => {
          const frames: { moving: boolean; collisions: number; commits: Record<string, number> }[] =
              [],
            start = performance.now();
          const sample = () => {
            const rects = [...document.querySelectorAll<HTMLElement>(".artboard-heading")].map(
              (element) => element.getBoundingClientRect(),
            );
            let collisions = 0;
            for (const [index, rect] of rects.entries())
              for (const other of rects.slice(0, index))
                if (
                  rect.left < other.right &&
                  rect.right > other.left &&
                  rect.top < other.bottom &&
                  rect.bottom > other.top
                )
                  collisions++;
            frames.push({
              moving:
                document.querySelector<HTMLElement>('[data-testid="artboard"]')!.dataset
                  .viewMoving === "true",
              collisions,
              commits: Object.fromEntries(
                [
                  ".musart-app",
                  ".inspector",
                  ".canvas-area",
                  ".editor-canvas",
                  ".editor-gpu-scene",
                ].map((selector) => [
                  selector,
                  Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
                ]),
              ),
            });
            if (performance.now() - start < 350) requestAnimationFrame(sample);
            else resolve(frames);
          };
          requestAnimationFrame(sample);
        },
      ),
  );
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -80);
  await page.keyboard.up("Control");
  const frames = await sampling;
  expect(frames.filter((frame) => frame.moving).length).toBeGreaterThan(3);
  for (const frame of frames) {
    expect(frame.collisions).toBe(0);
    if (frame.moving) expect(frame.commits).toEqual(baseline);
  }
  await zoomViewport(page, 0.05);
  await page.setViewportSize({ width: 800, height: 900 });
  const headings = page.locator(".artboard-heading");
  await expect(headings).toHaveCount(6);
  const rects = await headings.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect(),
        name = element.querySelector<HTMLElement>(".artboard-name")!,
        dimensions = element.querySelector<HTMLElement>(".artboard-dimensions")!;
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        compact: (element as HTMLElement).dataset.compact,
        dimensions: getComputedStyle(dimensions).display,
        ellipsis: getComputedStyle(name).textOverflow,
      };
    }),
  );
  for (const [index, rect] of rects.entries()) {
    expect(rect.height).toBeCloseTo(26, 3);
    expect(rect.compact).toBe("true");
    expect(rect.dimensions).toBe("none");
    expect(rect.ellipsis).toBe("ellipsis");
    for (const other of rects.slice(0, index))
      expect(
        rect.x < other.right &&
          rect.right > other.x &&
          rect.y < other.bottom &&
          rect.bottom > other.y,
      ).toBe(false);
  }
  await page
    .getByRole("button", { name: `Options du plan de travail : ${boards[0]!.name}`, exact: true })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Renommer", exact: true })).toBeVisible();
  await expect(menu.getByText("160 × 220 px", { exact: true })).toBeVisible();
  await expect(menu.getByRole("separator")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Supprimer", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/artboard-headings-compact.png" });
  await page.keyboard.press("Escape");
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await writeFile(
    "artifacts/artboard-headings.json",
    JSON.stringify(
      { browser: page.context().browser()!.version(), baseline, frames, rects, reads },
      null,
      2,
    ),
  );
});
