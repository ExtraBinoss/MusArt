import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  applyMotionFrame,
  compileMotion,
  createLayer,
  createLayerGeometryIndex,
  createPage,
  createProject,
  EditorEngine,
  evaluateMotion,
  transformPoint,
  type ImageAsset,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function fixture() {
  const original = await readFile(
    new URL(
      "../../apps/web/public/templates/motion/media/grapefruit-slice-332-332.jpg",
      import.meta.url,
    ),
  );
  const asset: ImageAsset = {
    id: "pose-photo",
    name: "In Bloom citrus original",
    mime: "image/jpeg",
    width: 332,
    height: 332,
    dataUrl: `data:image/jpeg;base64,${original.toString("base64")}`,
  };
  const group = createLayer("group", {
    id: "pose-parent",
    x: 160,
    y: 120,
    width: 400,
    height: 300,
  });
  const photo = createLayer("image", {
    id: "pose-citrus",
    name: "Citrus",
    parentId: group.id,
    x: 40,
    y: 40,
    width: 180,
    height: 180,
    assetId: asset.id,
  });
  const engine = new EditorEngine(
    createProject({
      id: "native-motion-pose",
      assets: { [asset.id]: asset },
      pages: [
        createPage({
          id: "posed-media",
          width: 960,
          height: 640,
          background: "#17231c",
          layers: [group, photo],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 20, rate: 1 } });
  for (const [layerId, property, from, to] of [
    [group.id, "rotation", 0, 45],
    [photo.id, "width", 180, 260],
    [photo.id, "height", 180, 220],
    [photo.id, "rotation", 0, 20],
  ] as const)
    for (const value of [0, 20])
      engine.execute({
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId, property },
        time: { value, rate: 1 },
        value: value ? to : from,
      });
  const project = engine.getSnapshot().project;
  const program = compileMotion(project, { compositionId: "posed-media" });
  const posed = applyMotionFrame(program, evaluateMotion(program, { value: 10, rate: 1 }));
  const geometry = createLayerGeometryIndex(posed),
    layer = geometry.get(photo.id),
    matrix = geometry.worldMatrix(photo.id);
  return {
    project,
    photoId: photo.id,
    layer,
    matrix,
    center: transformPoint(matrix, { x: layer.width / 2, y: layer.height / 2 }),
  };
}
async function seek(page: Page, value: string) {
  const input = page.getByRole("spinbutton", { name: "Temps actuel", exact: true });
  await input.fill(value);
  await input.press("Enter");
  await page.waitForFunction(
    (seconds) => {
      const raw =
        document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset
          .presentedMotionTime;
      if (!raw) return false;
      const time = JSON.parse(raw) as { value: number; rate: number };
      return time.value / time.rate === seconds;
    },
    Number(value) / 1000,
  );
}

type Evidence = Record<string, unknown>;

async function prepare(page: Page, evidence: Evidence) {
  const d = await fixture();
  const failures: string[] = [];
  evidence.failures = failures;
  evidence.expected = { width: d.layer.width, height: d.layer.height, matrix: d.matrix };
  evidence.stage = "bootstrap";
  page.on("pageerror", (error) => failures.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.theme", "dark");
  });
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), d.project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  evidence.stage = "seek";
  await seek(page, "10000");
  const view = await page.evaluate(() => {
    window.musart!.select([]);
    const artboard = document.querySelector<HTMLElement>('[data-testid="artboard"]')!;
    const bounds = artboard.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      scale: Number(artboard.dataset.zoom),
      beforeDraws: artboard.querySelector("canvas")!.dataset.renderCount,
      revision: window.musart!.snapshot().revision,
    };
  });
  evidence.view = view;
  evidence.stage = "ready";
  return {
    d,
    view,
    failures,
    center: { x: view.x + d.center.x * view.scale, y: view.y + d.center.y * view.scale },
    outline: page.locator('.canvas-selection[data-layer-id="' + d.photoId + '"]'),
  };
}

/** Preserve bounded partial evidence when any assertion or readiness step fails. */
async function record(page: Page, name: string, evidence: Evidence) {
  try {
    evidence.final = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
      const outline = document.querySelector<HTMLElement>(".canvas-selection[data-layer-id]");
      return {
        readbacks: window.__musartVideoReadbacks,
        userAgent: navigator.userAgent,
        dpr: devicePixelRatio,
        backend: canvas?.dataset.backend,
        presentedTime: canvas?.dataset.presentedMotionTime,
        width: outline?.style.width,
        height: outline?.style.height,
        selection: window.musart?.snapshot().selection,
      };
    });
  } catch (error) {
    evidence.captureError = String(error);
  }
  await mkdir("artifacts/motion/selection", { recursive: true });
  await writeFile(
    "artifacts/motion/selection/" + name + "-report.json",
    JSON.stringify(evidence, null, 2),
  );
  await page
    .screenshot({ path: "artifacts/motion/selection/" + name + ".png", timeout: 1500 })
    .catch(() => undefined);
}

test("paused Motion media picks and resize commits follow the evaluated parent pose", async ({
  page,
}) => {
  test.setTimeout(40000);
  const evidence: Evidence = {};
  try {
    const { d, view, center, outline, failures } = await prepare(page, evidence);
    evidence.stage = "pick";
    await page.mouse.click(center.x, center.y);
    await page.waitForFunction(
      (id) =>
        window.musart!.snapshot().selection[0] === id &&
        document.querySelector('.canvas-selection[data-layer-id="' + id + '"]'),
      d.photoId,
    );
    const initial = await outline.evaluate((node: HTMLElement) => {
      const matrix = new DOMMatrixReadOnly(node.style.transform);
      return {
        width: parseFloat(node.style.width),
        height: parseFloat(node.style.height),
        matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
        draws:
          document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!.dataset.renderCount,
      };
    });
    evidence.initial = initial;
    expect(initial.width).toBe(d.layer.width);
    expect(initial.height).toBe(d.layer.height);
    for (let index = 0; index < 6; index++)
      expect(initial.matrix[index]).toBeCloseTo(d.matrix[index]!, 3);
    expect(initial.draws).toBe(view.beforeDraws);

    const bounds = (await outline.locator('.canvas-handle[data-handle="se"]').boundingBox())!;
    const from = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    evidence.stage = "zero-delta";
    await page.keyboard.down("Alt");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y);
    expect(await outline.evaluate((node: HTMLElement) => parseFloat(node.style.width))).toBe(
      d.layer.width,
    );
    evidence.stage = "resize";
    await page.mouse.move(
      from.x + d.matrix[0] * 10 * view.scale,
      from.y + d.matrix[1] * 10 * view.scale,
      { steps: 2 },
    );
    await page.waitForFunction(
      ({ id, width, height }) => {
        const node = document.querySelector<HTMLElement>(
          '.canvas-selection[data-layer-id="' + id + '"]',
        );
        return (
          node &&
          Math.abs(parseFloat(node.style.width) - width) < 0.005 &&
          Math.abs(parseFloat(node.style.height) - height) < 0.005
        );
      },
      { id: d.photoId, width: d.layer.width + 10, height: d.layer.height },
    );
    await page.mouse.up();
    await page.keyboard.up("Alt");
    evidence.stage = "committed-pose";
    await page.waitForFunction(
      ({ id, width }) => {
        const snapshot = window.musart!.snapshot();
        const composition = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
        const property = composition.motion?.tracks
          .flatMap((track) => track.properties)
          .find(
            (item) =>
              item.target.kind === "layer" &&
              item.target.layerId === id &&
              item.target.property === "width",
          );
        const key = property?.keyframes.find((item) => item.time.value / item.time.rate === 10);
        const node = document.querySelector<HTMLElement>(
          '.canvas-selection[data-layer-id="' + id + '"]',
        );
        return (
          key &&
          Math.abs(Number(key.value) - width) < 0.005 &&
          node &&
          Math.abs(parseFloat(node.style.width) - width) < 0.005
        );
      },
      { id: d.photoId, width: d.layer.width + 10 },
    );
    const committed = await outline.evaluate((node: HTMLElement) => ({
      width: parseFloat(node.style.width),
      height: parseFloat(node.style.height),
      baseWidth: window
        .musart!.snapshot()
        .project.pages[0]!.layers.find((item) => item.id === node.dataset.layerId)!.width,
    }));
    evidence.committed = committed;
    expect(committed.width).toBeCloseTo(d.layer.width + 10, 2);
    expect(committed.height).toBeCloseTo(d.layer.height, 2);
    expect(committed.baseWidth).toBe(180);
    evidence.stage = "undo";
    await page.evaluate(() => window.musart!.undo());
    await expect
      .poll(() => outline.evaluate((node: HTMLElement) => parseFloat(node.style.width)))
      .toBe(d.layer.width);
    const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
    expect(readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(failures).toEqual([]);
    evidence.stage = "complete";
  } finally {
    await record(page, "paused-pose", evidence);
  }
});

test("Play selects visible Motion media without editing or pausing and leaves handles inert", async ({
  page,
}) => {
  test.setTimeout(40000);
  const evidence: Evidence = {};
  try {
    const { d, view, center, failures } = await prepare(page, evidence);
    evidence.stage = "play";
    await page.getByRole("button", { name: "Lire", exact: true }).click();
    await page.mouse.click(center.x, center.y);
    await page.waitForFunction(
      ({ id, revision }) => {
        const snapshot = window.musart!.snapshot();
        const node = document.querySelector<HTMLElement>(
          '.canvas-selection[data-layer-id="' + id + '"]',
        );
        return (
          snapshot.selection.length === 1 &&
          snapshot.selection[0] === id &&
          snapshot.revision === revision &&
          node &&
          getComputedStyle(node).opacity === "0.2" &&
          node.querySelector<HTMLButtonElement>(".canvas-handle")?.disabled
        );
      },
      { id: d.photoId, revision: view.revision },
    );
    evidence.stage = "play-selection";
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
    expect(readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(failures).toEqual([]);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    evidence.stage = "complete";
  } finally {
    await record(page, "play-pick", evidence);
  }
});
