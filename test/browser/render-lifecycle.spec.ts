import { expect, test } from "@playwright/test";
import { createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { installReadbackProbe } from "./support/readback-probe";
import { fitViewport } from "./support/viewport";

test("AFTERHOURS retains its presented frame and GPU context throughout colors, extreme moves and resize", async ({
  page,
}) => {
  test.setTimeout(180000);
  const messages: { type: string; text: string }[] = [],
    errors: string[] = [];
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      messages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const probe = {
      contexts: { webgpu: 0, webgl2: 0 },
      lost: [] as string[],
      samples: [] as { ready?: string; presented?: string; overlay: number; canvas: number }[],
      frame: 0,
    };
    Object.assign(window, { __renderContinuity: probe });
    const original = HTMLCanvasElement.prototype.getContext,
      seen = new WeakMap<HTMLCanvasElement, Set<string>>();
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      const result = Reflect.apply(original, this, [kind, ...args]);
      if (result && (kind === "webgpu" || kind === "webgl2")) {
        let kinds = seen.get(this);
        if (!kinds) {
          kinds = new Set();
          seen.set(this, kinds);
        }
        if (!kinds.has(kind)) {
          kinds.add(kind);
          probe.contexts[kind]++;
          this.addEventListener("webglcontextlost", () => probe.lost.push("webglcontextlost"));
        }
      }
      return result;
    } as HTMLCanvasElement["getContext"];
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let next = 0;
  const artboard = createTechnoArtboard(() => `continuity-${++next}`),
    project = createProject({ id: "continuity-project", pages: [artboard] }),
    paper = artboard.layers.find((layer) => layer.name === "Near-black paper")!;
  await page.evaluate(
    ({ project, id }) => {
      window.musart!.load(project);
      window.musart!.select([id]);
    },
    { project, id: paper.id },
  );
  await fitViewport(page);
  const canvas = page.locator(".canvas-artboard canvas");
  const presented = () =>
    page.waitForFunction(
      () => {
        const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
        return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
      },
      undefined,
      { timeout: 60000 },
    );
  await presented();
  await page.evaluate(() => window.musart!.flushThumbnails());
  // Let the finite first-frame reveal finish before measuring subsequent property updates.
  await page.waitForTimeout(250);
  await mkdir("artifacts/render-continuity", { recursive: true });
  await canvas.screenshot({ path: "artifacts/render-continuity/before.png" });
  const read = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!,
        probe = (
          window as unknown as {
            __renderContinuity: { contexts: Record<string, number>; lost: string[] };
          }
        ).__renderContinuity;
      return {
        contexts: { ...probe.contexts },
        lost: [...probe.lost],
        instances: canvas.dataset.rendererInstances,
        gpu: JSON.parse(canvas.dataset.gpuStats!),
        commits: Object.fromEntries(
          [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
            (selector) => [
              selector,
              Number(document.querySelector<HTMLElement>(selector)!.dataset.reactRenders),
            ],
          ),
        ),
      };
    });
  const before = await read();
  await page.evaluate(() => {
    const probe = (
      window as unknown as { __renderContinuity: { samples: unknown[]; frame: number } }
    ).__renderContinuity;
    function capture() {
      const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas"),
        loader = document.querySelector<HTMLElement>(".editor-gpu-scene > .canvas-loading");
      if (canvas && loader) {
        const style = getComputedStyle(loader);
        probe.samples.push({
          ready: canvas.dataset.rendererReady,
          presented: canvas.dataset.presentationReady,
          overlay:
            style.display === "none" || style.visibility === "hidden" ? 0 : Number(style.opacity),
          canvas: Number(getComputedStyle(canvas).opacity),
        });
      }
      probe.frame = requestAnimationFrame(capture);
    }
    capture();
  });
  const saturation = page.locator(".react-colorful__saturation .react-colorful__interactive");
  await saturation.scrollIntoViewIfNeeded();
  const box = (await saturation.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  const heldBefore = await read();
  for (const [index, [x, y]] of [
    [0.9, 0.1],
    [0.1, 0.9],
    [0.6, 0.45],
  ].entries()) {
    await page.mouse.move(box.x + box.width * x!, box.y + box.height * y!, { steps: 3 });
    await presented();
    await canvas.screenshot({ path: `artifacts/render-continuity/color-${index}.png` });
  }
  const heldAfter = await read();
  await page.mouse.up();
  expect(heldAfter.commits).toEqual(heldBefore.commits);
  expect(heldAfter.contexts).toEqual(before.contexts);
  expect(heldAfter.gpu.targets).toBe(before.gpu.targets);
  for (const [index, [x, y, rotation]] of [
    [-4000, 2500, 179],
    [3500, -4000, -179],
    [0, 0, 0],
  ].entries()) {
    await page.evaluate(
      ({ id, x, y, rotation }) =>
        window.musart!.execute({ type: "updateLayers", ids: [id], patch: { x, y, rotation } }),
      { id: paper.id, x: x!, y: y!, rotation: rotation! },
    );
    await presented();
    await canvas.screenshot({ path: `artifacts/render-continuity/move-${index}.png` });
  }
  await page.evaluate(() => window.musart!.execute({ type: "updatePage", patch: { width: 1090 } }));
  await presented();
  await canvas.screenshot({ path: "artifacts/render-continuity/resized.png" });
  const after = await read(),
    samples = await page.evaluate(() => {
      const probe = (
        window as unknown as {
          __renderContinuity: {
            samples: { ready?: string; presented?: string; overlay: number; canvas: number }[];
            frame: number;
          };
        }
      ).__renderContinuity;
      cancelAnimationFrame(probe.frame);
      return probe.samples;
    });
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      dpr: devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight },
      adapter: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
          }
        : null,
    };
  });
  await writeFile(
    "artifacts/render-continuity/report.json",
    JSON.stringify(
      {
        browser: page.context().browser()!.version(),
        environment,
        before,
        heldBefore,
        heldAfter,
        after,
        samples,
        messages,
        errors,
        reads,
      },
      null,
      2,
    ),
  );
  expect(samples.length).toBeGreaterThan(8);
  expect(samples.some((sample) => sample.ready === "false")).toBe(true);
  expect(
    samples.every(
      (sample) => sample.presented === "true" && sample.overlay === 0 && sample.canvas === 1,
    ),
  ).toBe(true);
  expect(after.contexts).toEqual(before.contexts);
  expect(heldAfter.gpu.uniformBuffers).toBe(before.gpu.uniformBuffers);
  expect(heldAfter.gpu.uniformBytes).toBe(before.gpu.uniformBytes);
  expect(heldAfter.gpu.nodePrograms).toBe(before.gpu.nodePrograms);
  expect(after.instances).toBe("1");
  expect(after.lost).toEqual([]);
  expect(messages).toEqual([]);
  expect(errors).toEqual([]);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
