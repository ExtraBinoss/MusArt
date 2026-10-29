import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Project } from "@musart/core";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { projectLayerWorkspace } from "../../apps/web/src/components/layers/tree/project";
import { visibleThumbnailsReady } from "./support/selection-profile";
import { instrumentGpu, startEditorTrace } from "./support/editor-action-probe";

interface Target {
  pageId: string;
  layerId: string;
  effectId: string;
  label: string;
}
interface EyeState {
  at: number;
  commits: Record<string, number>;
  gpu: Record<string, number>;
  rendererInstances?: string;
  sceneRevision?: string;
  renderedRevision?: string;
  canonicalRevision?: string;
  enabled: boolean | null;
  buttonLabel: string | null;
  ariaPressed: string | null;
  renderError?: string;
}
interface EyeSample {
  action: string;
  generatedAt: number;
  dispatchAt: number;
  clickGeneratedAt: number;
  clickDispatchAt: number;
  canonicalObservedAt: number;
  canonicalSnapshotReadMs: number;
  canonicalEnabled: boolean | undefined;
  canonicalRevision: number;
  uiReadyAt: number;
  presentationOpportunityAt: number;
  gpuReadyAt: number;
  generatedToUiMs: number;
  dispatchToUiMs: number;
  clickToCanonicalObservedMs: number;
  dispatchToGpuMs: number;
  before: EyeState;
  urgent: EyeState;
  settled: EyeState;
  submits: { at: number; queue: number; source: string }[];
}
interface EyeProbe {
  action: string;
  target: Target;
  capture?: { generatedAt: number; dispatchAt: number };
  result?: EyeSample;
  error?: string;
  cancel: () => void;
}
declare global {
  interface Window {
    __effectEyeProbe?: EyeProbe;
  }
}

async function drawn(page: Page, pageId: string, revision?: number) {
  await page.waitForFunction(
    ({ pageId, revision }) => {
      const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        data?.pageId === pageId &&
        data.rendererReady === "true" &&
        data.sceneRevision === data.renderedRevision &&
        (revision === undefined || Number(data.canonicalRevision) >= revision)
      );
    },
    { pageId, revision },
  );
}

async function armEye(page: Page, target: Target, enabled: boolean, action: string) {
  await page.evaluate(
    ({ target, enabled, action }) => {
      window.__effectEyeProbe?.cancel();
      const selector = `[data-effect-id="${CSS.escape(target.effectId)}"]`;
      const state = (): EyeState => {
        const row = document.querySelector<HTMLElement>(selector);
        const button = row?.querySelector<HTMLButtonElement>(".attachment-actions button");
        const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!.dataset;
        return {
          at: performance.now(),
          commits: Object.fromEntries(
            [
              ".musart-app",
              ".inspector",
              ".layers-panel",
              ".canvas-area",
              ".editor-canvas",
              ".editor-gpu-scene",
            ].map((selector) => [
              selector,
              Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders ?? 0),
            ]),
          ),
          gpu: JSON.parse(data.gpuStats!),
          rendererInstances: data.rendererInstances,
          sceneRevision: data.sceneRevision,
          renderedRevision: data.renderedRevision,
          canonicalRevision: data.canonicalRevision,
          enabled: row ? !row.classList.contains("is-hidden") : null,
          buttonLabel: button?.getAttribute("aria-label") ?? null,
          ariaPressed: button?.getAttribute("aria-pressed") ?? null,
          renderError: data.renderError,
        };
      };
      const before = state();
      let frame = 0,
        presentationFrame = 0,
        finished = false;
      let generatedAt = 0,
        dispatchAt = 0,
        clickGeneratedAt = 0,
        clickDispatchAt = 0;
      let canonicalObservedAt = 0,
        canonicalSnapshotReadMs = 0,
        canonicalRevision = -1;
      let canonicalEnabled: boolean | undefined;
      let uiReadyAt = 0,
        presentationOpportunityAt = 0,
        gpuReadyAt = 0;
      let urgent = before;
      const matches = (event: Event) =>
        event.target instanceof Element &&
        Boolean(event.target.closest(`${selector} .attachment-actions button:first-child`));
      const probe: EyeProbe = { action, target, cancel: cleanup };
      window.__effectEyeProbe = probe;
      const timer = setTimeout(() => {
        probe.error = `Timed out waiting for ${action}; last DOM state: ${JSON.stringify(state())}`;
        cleanup();
      }, 10000);
      function cleanup() {
        finished = true;
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        cancelAnimationFrame(presentationFrame);
        window.removeEventListener("pointerdown", down, true);
        window.removeEventListener("click", clickCapture, true);
        window.removeEventListener("click", clickTail);
      }
      function clickCapture(event: MouseEvent) {
        if (!matches(event)) return;
        clickGeneratedAt = event.timeStamp;
        clickDispatchAt = performance.now();
      }
      function clickTail(event: MouseEvent) {
        if (!matches(event)) return;
        // One canonical read at the native click tail, never in a measured RAF.
        // Its clone cost is explicit; this is an observation bound, not an engine subscription.
        const started = performance.now();
        const snapshot = window.musart!.snapshot();
        canonicalSnapshotReadMs = performance.now() - started;
        canonicalObservedAt = performance.now();
        canonicalRevision = snapshot.revision;
        canonicalEnabled = snapshot.project.pages
          .find((page) => page.id === target.pageId)
          ?.layers.find((layer) => layer.id === target.layerId)
          ?.effects.find((effect) => effect.id === target.effectId)?.enabled;
      }
      function finish() {
        if (!uiReadyAt || !presentationOpportunityAt || !gpuReadyAt || finished) return;
        const end = performance.now();
        probe.result = {
          action,
          generatedAt,
          dispatchAt,
          clickGeneratedAt,
          clickDispatchAt,
          canonicalObservedAt,
          canonicalSnapshotReadMs,
          canonicalEnabled,
          canonicalRevision,
          uiReadyAt,
          presentationOpportunityAt,
          gpuReadyAt,
          generatedToUiMs: uiReadyAt - generatedAt,
          dispatchToUiMs: uiReadyAt - dispatchAt,
          clickToCanonicalObservedMs: canonicalObservedAt - clickDispatchAt,
          dispatchToGpuMs: gpuReadyAt - dispatchAt,
          before,
          urgent,
          settled: state(),
          submits: window.__editorGpuProbe!.submits.filter(
            (entry) => entry.at >= dispatchAt && entry.at <= end,
          ),
        };
        cleanup();
      }
      function check() {
        if (finished) return;
        const row = document.querySelector<HTMLElement>(selector);
        const button = row?.querySelector<HTMLButtonElement>(".attachment-actions button");
        const expectedLabel = enabled ? "Désactiver l’effet" : "Activer l’effet";
        if (
          !uiReadyAt &&
          row &&
          !row.classList.contains("is-hidden") === enabled &&
          button?.getAttribute("aria-label") === expectedLabel &&
          canonicalEnabled === enabled
        ) {
          uiReadyAt = performance.now();
          urgent = state();
          presentationFrame = requestAnimationFrame(() => {
            presentationOpportunityAt = performance.now();
            finish();
          });
        }
        const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
        if (
          !gpuReadyAt &&
          canonicalEnabled === enabled &&
          data?.pageId === target.pageId &&
          data.rendererReady === "true" &&
          data.sceneRevision !== before.sceneRevision &&
          data.sceneRevision === data.renderedRevision &&
          Number(data.canonicalRevision) >= canonicalRevision
        )
          gpuReadyAt = performance.now();
        finish();
        if (!finished) frame = requestAnimationFrame(check);
      }
      function down(event: PointerEvent) {
        if (!matches(event) || dispatchAt) return;
        generatedAt = event.timeStamp;
        dispatchAt = performance.now();
        probe.capture = { generatedAt, dispatchAt };
        frame = requestAnimationFrame(check);
      }
      window.addEventListener("pointerdown", down, true);
      window.addEventListener("click", clickCapture, true);
      window.addEventListener("click", clickTail);
    },
    { target, enabled, action },
  );
}

async function revealEffect(page: Page, project: Project, target: Target) {
  const entries = projectLayerWorkspace(project, new Set(), new Set(), new Set());
  const index = entries.findIndex(
    (entry) => entry.kind === "layer" && entry.layer.id === target.layerId,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  await page.locator(".layer-tree").evaluate((tree, index) => {
    tree.scrollTop = index * 36;
  }, index);
  const row = page.locator(`.layer-row[data-layer-id="${target.layerId}"]`);
  await expect(row).toBeVisible();
  await row.locator(".layer-name").click();
  if ((await row.getAttribute("aria-expanded")) === "false")
    await row.locator(".group-chevron").click();
  const effect = page.locator(`[data-effect-id="${target.effectId}"]`);
  await expect(effect).toBeVisible();
  await expect(page.locator(".layer-tree-window")).not.toHaveAttribute("data-expanding", "true");
  await drawn(page, target.pageId);
  return effect.locator(".attachment-actions button").first();
}

test("native effect eyes publish promptly and separately acknowledge real AFTERHOURS/Dither pixels", async ({
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
  const poster = createTechnoArtboard(() => `eye-afterhours-${++sequence}`);
  const sourceFiles = ["50-waterfall-5.jpg", "49-waterfall-4.jpg"];
  const bytes = await Promise.all(
    sourceFiles.map((file) => readFile(`apps/web/public/benchmark/${file}`)),
  );
  const images = bytes.map((_, index) =>
    createLayer("image", {
      id: `eye-image-${index}`,
      name: `Dither photograph ${index + 1}`,
      assetId: `eye-photo-${index}`,
      x: index ? 560 : 80,
      y: index ? 900 : 240,
      width: 420,
      height: 315,
      effects: [createEffect("dither", { id: `eye-dither-${index}` })],
    }),
  );
  const photos = createPage({
    id: "eye-photos",
    name: "Two Dither photographs",
    width: 1080,
    height: 1920,
    layers: images,
  });
  const project = createProject({
    id: "native-effect-visibility-latency",
    pages: [poster, photos],
    assets: Object.fromEntries(
      bytes.map((value, index) => {
        const id = `eye-photo-${index}`;
        return [
          id,
          {
            id,
            name: sourceFiles[index]!,
            mime: "image/jpeg",
            width: 1280,
            height: 960,
            dataUrl: `data:image/jpeg;base64,${value.toString("base64")}`,
          },
        ];
      }),
    ),
  });
  const posterLayer = poster.layers.find((layer) => layer.name === "Signal sphere / isolated")!;
  const targets: Target[] = [
    ...images.map((layer, index) => ({
      pageId: photos.id,
      layerId: layer.id,
      effectId: layer.effects[0]!.id,
      label: `photograph-${index + 1}-dither`,
    })),
    {
      pageId: poster.id,
      layerId: posterLayer.id,
      effectId: posterLayer.effects[0]!.id,
      label: "afterhours-signal-sphere-dither",
    },
  ];
  const samples: EyeSample[] = [];
  const preparations: { label: string; ms: number }[] = [];
  let diagnosticTrace:
    | Awaited<ReturnType<Awaited<ReturnType<typeof startEditorTrace>>>>
    | { error: string } = null;
  const read = () => page.evaluate(() => window.musart!.snapshot());
  try {
    await page.evaluate((project) => window.musart!.load(project), project);
    await drawn(page, poster.id);
    await page.bringToFront();
    for (const [index, target] of targets.entries()) {
      const started = performance.now();
      const eye = await revealEffect(page, project, target);
      await page.evaluate(() => window.musart!.flushThumbnails());
      await visibleThumbnailsReady(page);
      preparations.push({ label: target.label, ms: performance.now() - started });
      const baseline = await read();
      const changedProjects: Project[] = [];
      for (const enabled of [false, true]) {
        const before = await read();
        const action = `${target.label}-${enabled ? "enable" : "disable"}`;
        const stop =
          index === 0 && enabled
            ? await startEditorTrace(
                page,
                `artifacts/effect-visibility-latency/${process.env.MUSART_SELECTION_COHORT ?? "candidate"}-warm-toggle`,
              )
            : null;
        try {
          await armEye(page, target, enabled, action);
          await eye.click();
          await page.waitForFunction(() =>
            Boolean(window.__effectEyeProbe?.result || window.__effectEyeProbe?.error),
          );
          const probe = await page.evaluate(() => ({
            result: window.__effectEyeProbe?.result,
            error: window.__effectEyeProbe?.error,
          }));
          expect(probe.error).toBeUndefined();
          expect(probe.result).toBeDefined();
          samples.push(probe.result!);
        } finally {
          if (stop)
            try {
              diagnosticTrace = await stop();
            } catch (error) {
              diagnosticTrace = { error: String(error) };
            }
        }
        const after = await read();
        const expected = structuredClone(before.project);
        const updatedAt = Date.parse(after.project.updatedAt);
        expect(Number.isFinite(updatedAt)).toBe(true);
        expect(updatedAt).toBeGreaterThanOrEqual(Date.parse(before.project.updatedAt));
        expected.updatedAt = after.project.updatedAt;
        expected.pages
          .find((page) => page.id === target.pageId)!
          .layers.find((layer) => layer.id === target.layerId)!
          .effects.find((effect) => effect.id === target.effectId)!.enabled = enabled;
        expect(after.project).toEqual(expected);
        expect(after.revision).toBe(before.revision + 1);
        expect(after.canUndo).toBe(true);
        expect(samples.at(-1)!.canonicalEnabled).toBe(enabled);
        expect(samples.at(-1)!.settled.renderError).toBeUndefined();
        expect(samples.at(-1)!.settled.rendererInstances).toBe(
          samples.at(-1)!.before.rendererInstances,
        );
        changedProjects.push(after.project);
      }
      await page.keyboard.press("Control+z");
      expect((await read()).project).toEqual(changedProjects[0]);
      await page.keyboard.press("Control+z");
      const restored = await read();
      expect(restored.project).toEqual(baseline.project);
      expect(restored.canUndo).toBe(baseline.canUndo);
      await drawn(page, target.pageId, restored.revision);
    }
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
  } finally {
    const final = await page.evaluate(async () => {
      const probe = window.__effectEyeProbe;
      const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      const info = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : null;
      return {
        environment: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          viewport: [innerWidth, innerHeight],
          dpr: devicePixelRatio,
          backend: data?.backend,
          adapter: info
            ? {
                vendor: info.vendor,
                architecture: info.architecture,
                device: info.device,
                description: info.description,
                isFallbackAdapter: info.isFallbackAdapter,
              }
            : null,
        },
        probe: probe
          ? {
              action: probe.action,
              target: probe.target,
              capture: probe.capture,
              error: probe.error,
            }
          : null,
        canvas: data ? Object.fromEntries(Object.entries(data)) : null,
        reads: window.__musartVideoReadbacks,
      };
    });
    await mkdir("artifacts/effect-visibility-latency", { recursive: true });
    await writeFile(
      `artifacts/effect-visibility-latency/${process.env.MUSART_SELECTION_COHORT ?? "candidate"}.json`,
      JSON.stringify(
        {
          fixture: {
            template: poster.name,
            posterLayers: poster.layers.length,
            imageLayers: 2,
            sources: sourceFiles.map((file, index) => ({
              file,
              sha256: createHash("sha256").update(bytes[index]!).digest("hex"),
            })),
          },
          browser: browser.version(),
          preparations,
          samples,
          diagnosticTrace,
          pageErrors,
          ...final,
          boundary:
            "Native pointerdown/click clocks; useful eye label/row state at first RAF, second RAF is a presentation opportunity. Canonical enabled is observed once at click tail with clone cost explicit. GPU readiness requires a changed scene revision, matching rendered revision and canonical acknowledgment. No physical-latency, INP or 60fps claim.",
        },
        null,
        2,
      ),
    );
    await page.evaluate(() => {
      window.__effectEyeProbe?.cancel();
      delete window.__effectEyeProbe;
      window.__editorGpuProbe?.restore();
      delete window.__editorGpuProbe;
    });
  }
});
