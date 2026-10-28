import { expect, test, type Page } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createLayerGeometryIndex,
  transformPoint,
  type Composition,
} from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import {
  panSample,
  storageReload,
  largeMoveSample,
  loadMeasuredProject,
  visibleThumbnailsReady,
  profileClock,
} from "./support/selection-profile";
import { installReadbackProbe } from "./support/readback-probe";

interface SelectionSurfaceState {
  commits: Record<string, number>;
  gpu: Record<string, number>;
  rendererInstances: string | undefined;
}

function clickTargets(page: Composition) {
  const index = createLayerGeometryIndex(page);
  const found = new Set<string>(),
    targets: { id: string; name: string; localX: number; x: number; y: number }[] = [];
  for (let y = 0.12; y < 0.94; y += 0.08)
    for (let x = 0.12; x < 0.94; x += 0.08) {
      const point = { x: page.width * x, y: page.height * y },
        layer = index.hitTest(point);
      const tolerance = layer ? Math.min(3, layer.width / 8, layer.height / 8) : 3;
      if (
        !layer ||
        found.has(layer.id) ||
        ![-tolerance, 0, tolerance].every((dx) =>
          [-tolerance, 0, tolerance].every(
            (dy) => index.hitTest({ x: point.x + dx, y: point.y + dy })?.id === layer.id,
          ),
        )
      )
        continue;
      found.add(layer.id);
      targets.push({ id: layer.id, name: layer.name, localX: layer.x, ...point });
      if (targets.length === 6) return targets;
    }
  return targets;
}
/** Prefer the first real text selection so font controls are measured before they are mounted. */
function coldTarget(page: Composition, fallback: ReturnType<typeof clickTargets>[number]) {
  const geometry = createLayerGeometryIndex(page);
  const candidates: ReturnType<typeof clickTargets> = [];
  for (const layer of page.layers) {
    if (
      layer.kind !== "text" ||
      layer.maskSource ||
      !geometry.isVisible(layer.id) ||
      geometry.isLocked(layer.id)
    )
      continue;
    for (const fraction of [0.5, 0.25, 0.75]) {
      const point = transformPoint(geometry.worldMatrix(layer.id), {
        x: layer.width * fraction,
        y: layer.height / 2,
      });
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > page.width ||
        point.y > page.height ||
        geometry.hitTest(point)?.id !== layer.id
      )
        continue;
      candidates.push({ id: layer.id, name: layer.name, localX: layer.x, ...point });
      break;
    }
  }
  return candidates.sort((a, b) => a.y - b.y)[0] ?? fallback;
}
async function rendered(page: Page) {
  await page.waitForFunction(
    () => {
      const data = document.querySelector<HTMLCanvasElement>(
        '[data-testid="artboard"] canvas',
      )?.dataset;
      return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
    },
    undefined,
    { timeout: 120000 },
  );
}
let clickSequence = 0;
async function clickSample(page: Page, target: ReturnType<typeof clickTargets>[number]) {
  const box = (await page.getByTestId("artboard").boundingBox())!;
  const size = await page.getByTestId("artboard").evaluate((element) => ({
    width: (element as HTMLElement).offsetWidth,
    height: (element as HTMLElement).offsetHeight,
  }));
  const x = box.x + (target.x * box.width) / size.width,
    y = box.y + (target.y * box.height) / size.height;
  await page.mouse.move(x, y);
  const token = String(++clickSequence);
  const measurement = page.evaluate(
    ({ target, token }) =>
      new Promise<{
        ms: number;
        startedAt: number;
        endedAt: number;
        overlayMs: number;
        sidebarMs: number;
        before: SelectionSurfaceState;
        after: SelectionSurfaceState;
      }>((resolve, reject) => {
        function capture() {
          const canvas = document.querySelector<HTMLCanvasElement>(
            '[data-testid="artboard"] canvas',
          )!;
          return {
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
            gpu: JSON.parse(canvas.dataset.gpuStats!) as Record<string, number>,
            rendererInstances: canvas.dataset.rendererInstances,
          };
        }
        const before = capture();
        let frame = 0,
          checks = 0,
          seen = false,
          state = "";
        const timer = setTimeout(() => {
          cancelAnimationFrame(frame);
          window.removeEventListener("pointerdown", down, true);
          reject(
            new Error(
              `Selection did not paint: ${target.id}; inspector=${document.querySelector<HTMLElement>(".inspector")?.dataset.selectedLayerId}; overlays=${[...document.querySelectorAll<HTMLElement>(".canvas-selection")].map((item) => item.dataset.layerId).join(",")}; X=${document.querySelector<HTMLInputElement>('.inspector input[aria-label="X"]')?.value}; seen=${seen}; checks=${checks}; state=${state}; targetX=${target.localX}`,
            ),
          );
        }, 10000);
        const down = (event: PointerEvent) => {
          seen = true;
          const start = event.timeStamp;
          let overlayMs: number | null = null,
            sidebarMs: number | null = null;
          const check = () => {
            checks++;
            const inspector = document.querySelector<HTMLElement>(".inspector")!,
              field = inspector.querySelector<HTMLInputElement>('input[aria-label="X"]');
            const row = document.querySelector<HTMLElement>(
              `.layer-row[data-layer-id="${CSS.escape(target.id)}"]`,
            );
            if (
              overlayMs === null &&
              document.querySelector(`.canvas-selection[data-layer-id="${CSS.escape(target.id)}"]`)
            )
              overlayMs = performance.now() - start;
            if (
              sidebarMs === null &&
              (inspector.dataset.selectedLayerId === target.id ||
                (!inspector.hasAttribute("data-selected-layer-id") &&
                  row?.getAttribute("aria-selected") === "true")) &&
              field &&
              Math.abs(Number(field.value) - target.localX) < 0.001
            )
              sidebarMs = performance.now() - start;
            state = `${overlayMs}:${sidebarMs}:${field?.value}:${inspector.dataset.selectedLayerId}`;
            if (overlayMs !== null && sidebarMs !== null)
              frame = requestAnimationFrame(() => {
                clearTimeout(timer);
                resolve({
                  ms: performance.now() - start,
                  startedAt: start,
                  endedAt: performance.now(),
                  overlayMs: overlayMs!,
                  sidebarMs: sidebarMs!,
                  before,
                  after: capture(),
                });
              });
            else frame = requestAnimationFrame(check);
          };
          frame = requestAnimationFrame(check);
        };
        window.addEventListener("pointerdown", down, { capture: true, once: true });
        document.documentElement.dataset.selectionProbe = token;
      }),
    { target, token },
  );
  await page.waitForFunction(
    (token) => document.documentElement.dataset.selectionProbe === token,
    token,
  );
  await page.mouse.click(x, y);
  return measurement;
}

for (const fixture of ["poster-150", "images-50", "elements-10000"] as const)
  test(`${fixture}: native warm canvas selection reuses GPU work and paints within100ms`, async ({
    page,
  }) => {
    test.setTimeout(360000);
    await installReadbackProbe(page);
    await page.goto(fixture === "images-50" ? "/?benchmark=50&automation=1" : "/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 120000 });
    const coldStart = await page.evaluate(() => performance.now());
    let load: { started: number; callMs: number } | undefined;
    if (fixture === "poster-150") {
      let id = 0;
      load = await loadMeasuredProject(
        page,
        createProject({ pages: [createTechnoArtboard(() => `selection-${++id}`)] }),
      );
    }
    if (fixture === "elements-10000") {
      load = await loadMeasuredProject(
        page,
        createProject({
          id: "profile-10000",
          name: "10,000 actual elements",
          pages: [
            createPage({
              id: "ten-thousand",
              width: 512,
              height: 512,
              layers: Array.from({ length: 10000 }, (_, index) =>
                createLayer("rectangle", {
                  id: `tile-${index}`,
                  name: `Tile ${index}`,
                  x: 6 + (index % 100) * 5,
                  y: 6 + Math.floor(index / 100) * 5,
                  width: 4,
                  height: 4,
                  fill: index % 2 ? "#6699cc" : "#cc9966",
                }),
              ),
            }),
          ],
        }),
      );
    }
    await rendered(page);
    const firstFrame = await page.evaluate(() => ({
      time: performance.now(),
      gpu: JSON.parse(
        document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!.dataset
          .gpuStats!,
      ) as Record<string, number>,
    }));
    const snapshotStart = performance.now();
    const { projectId, composition, snapshotMs } = await page.evaluate(() => {
      const start = performance.now();
      const snapshot = window.musart!.snapshot();
      return {
        projectId: snapshot.project.id,
        composition: snapshot.project.pages.find((page) => page.id === snapshot.pageId)!,
        snapshotMs: performance.now() - start,
      };
    });
    const snapshotRpcMs = performance.now() - snapshotStart;
    const targets = clickTargets(composition);
    expect(targets.length).toBeGreaterThanOrEqual(3);
    const firstTarget = coldTarget(composition, targets[0]!);
    const coldSession = await page.context().newCDPSession(page);
    await coldSession.send("Profiler.enable");
    await coldSession.send("Profiler.setSamplingInterval", { interval: 1000 });
    const coldClock = await profileClock(coldSession, page);
    await coldSession.send("Profiler.start");
    const coldSelection = {
      id: firstTarget.id,
      name: firstTarget.name,
      ...(await clickSample(page, firstTarget)),
    };
    const { profile: coldProfile } = await coldSession.send("Profiler.stop");
    await coldSession.detach();
    await mkdir("artifacts", { recursive: true });
    await writeFile(`artifacts/selection-${fixture}-cold.cpuprofile`, JSON.stringify(coldProfile));
    const thumbnailsStarted = performance.now();
    const canonicalThumbnailsMs = await page.evaluate(async () => {
      const start = performance.now();
      await window.musart!.flushThumbnails();
      return performance.now() - start;
    });
    await rendered(page);
    await visibleThumbnailsReady(page);
    const cold = {
      automationLoadMs: load?.callMs,
      firstUsefulFrameMs: firstFrame.time - (load?.started ?? coldStart),
      firstFrameSinceNavigationMs: firstFrame.time,
      firstFrameGpu: firstFrame.gpu,
      canonicalThumbnailsMs,
    };
    const thumbnailPreparationMs = performance.now() - thumbnailsStarted;

    await clickSample(page, targets[0]!);
    await visibleThumbnailsReady(page);
    await page.waitForTimeout(250);
    const session = await page.context().newCDPSession(page);
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 1000 });
    const warmClock = await profileClock(session, page);
    await session.send("Profiler.start");
    const samples = [];
    let failure: unknown;
    try {
      for (const target of [...targets.slice(1), ...targets.slice(0, 3)])
        samples.push({ id: target.id, name: target.name, ...(await clickSample(page, target)) });
    } catch (error) {
      failure = error;
    }
    const { profile } = await session.send("Profiler.stop");
    await session.detach();
    await mkdir("artifacts", { recursive: true });
    await writeFile(`artifacts/selection-${fixture}.cpuprofile`, JSON.stringify(profile));
    if (failure) {
      await writeFile(
        `artifacts/selection-${fixture}-partial.json`,
        JSON.stringify(
          {
            failure:
              failure instanceof Error
                ? (failure.stack ?? failure.message)
                : JSON.stringify(failure),
            samples,
            clocks: { cold: coldClock, warm: warmClock },
          },
          null,
          2,
        ),
      );
      throw failure;
    }
    const sorted = samples.map((sample) => sample.ms).sort((a, b) => a - b),
      summary = {
        median: sorted[Math.floor(sorted.length / 2)]!,
        p95: sorted[Math.floor(sorted.length * 0.95)]!,
        values: sorted,
      };
    const pan = await panSample(page);
    const move = fixture === "elements-10000" ? await largeMoveSample(page) : undefined;
    await rendered(page);
    await mkdir("artifacts/screenshots", { recursive: true });
    await page.screenshot({ path: `artifacts/screenshots/selection-${fixture}.png` });
    const storage = await storageReload(page, projectId, composition.layers.length);
    const reads = await page.evaluate(() => window.__musartVideoReadbacks!),
      environment = await page.evaluate(async () => {
        const info = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : undefined;
        return {
          userAgent: navigator.userAgent,
          dpr: devicePixelRatio,
          adapter: info
            ? {
                vendor: info.vendor,
                architecture: info.architecture,
                device: info.device,
                description: info.description,
              }
            : null,
        };
      });
    await mkdir("artifacts", { recursive: true });
    await writeFile(`artifacts/selection-${fixture}.cpuprofile`, JSON.stringify(profile));
    await writeFile(
      `artifacts/selection-${fixture}.json`,
      JSON.stringify(
        {
          fixture,
          layers: composition.layers.length,
          browser: page.context().browser()!.version(),
          environment,
          summary,
          cold,
          diagnosticSnapshot: { browserMs: snapshotMs, rpcMs: snapshotRpcMs },
          coldSelection,
          thumbnailPreparationMs,
          samples,
          clocks: { cold: coldClock, warm: warmClock },
          pan,
          storage,
          move,
          reads,
        },
        null,
        2,
      ),
    );
    for (const sample of samples) {
      expect(sample.after.gpu.submitted).toBe(sample.before.gpu.submitted);
      expect(sample.after.gpu.uploads).toBe(sample.before.gpu.uploads);
      expect(sample.after.rendererInstances).toBe(sample.before.rendererInstances);
    }
    expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    for (const surface of Object.keys(pan.before.commits))
      expect(pan.during.commits[surface], `pan React commits on ${surface}`).toBe(
        pan.before.commits[surface],
      );
    expect(pan.during.gpu.submitted).toBe(pan.before.gpu.submitted);
    expect(pan.during.gpu.uploads).toBe(pan.before.gpu.uploads);
    expect(pan.during.rendererInstances).toBe(pan.before.rendererInstances);
    expect(pan.positions).toBeGreaterThan(20);
    expect(pan.gaps.p95).toBeLessThanOrEqual(25);
    expect(pan.gaps.max).toBeLessThanOrEqual(50);
    expect(pan.longTasks).toEqual([]);
    if (move) {
      expect(move.moved.count).toBe(10000);
      expect(move.moved.first.x).toBeCloseTo(18, 1);
      expect(move.moved.first.y).toBeCloseTo(15, 1);
      expect(move.moved.last.x).toBeCloseTo(513, 1);
      expect(move.undone.first.x).toBe(6);
      expect(move.undone.first.y).toBe(6);
      expect(move.undone.last.x).toBe(501);
      expect(move.undone.canUndo).toBe(false);
      for (const surface of Object.keys(move.before.commits))
        expect(move.held.commits[surface], `held10k React commits on ${surface}`).toBe(
          move.before.commits[surface],
        );
      expect(move.held.gpu.uploads).toBe(move.before.gpu.uploads);
    }
    expect(coldSelection.ms, `first cold selection (${coldSelection.name})`).toBeLessThanOrEqual(
      100,
    );
    expect(summary.p95).toBeLessThanOrEqual(100);
  });
