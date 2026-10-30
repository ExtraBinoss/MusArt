import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { installReadbackProbe } from "../../browser/support/readback-probe";
import { installTextShaperProbe, textShaperSurface } from "./probe";
import { textShaperProject, TEXT_SHAPER_WARM_IDS, TEXT_SHAPER_WARM_TEXT } from "./fixture";

test("production text preparation: 150 editable layers and ten real bundled fonts", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const directory = process.env.MUSART_TEXT_OUTPUT;
  if (!directory)
    throw Error("Explicit MUSART_TEXT_OUTPUT is required to retain this observation.");
  await mkdir(directory, { recursive: true });
  const project = textShaperProject();
  const fixture = JSON.stringify(project);
  const fixtureSha = createHash("sha256").update(fixture).digest("hex");
  expect(project.pages[0]!.layers).toHaveLength(150);
  expect(new Set(project.pages[0]!.layers.map((layer) => layer.fontFamily)).size).toBe(10);
  await writeFile(`${directory}/fixture.json`, fixture);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await installTextShaperProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Performance.enable");
  await page.bringToFront();
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => Boolean(window.musart) || Boolean(document.querySelector("vite-error-overlay")),
  );
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  const bootstrap = await page.evaluate(() => ({
    observedAutomationAt: performance.now(),
    navigation: performance.getEntriesByType("navigation").map((entry) => entry.toJSON()),
  }));
  await page.evaluate((project) => {
    const phase = window.__textShaperProfile!.arm("cold-document", project.id);
    window.musart!.load(project);
    phase.published = performance.now();
  }, project);
  async function waitPhase() {
    await page.waitForFunction(() => {
      const phase = window.__textShaperProfile!.phases.at(-1);
      return Boolean(phase?.secondRaf || phase?.failure);
    });
    const phase = await page.evaluate(() => window.__textShaperProfile!.phases.at(-1)!);
    await writeFile(
      `${directory}/${phase.label}.raw.json`,
      JSON.stringify(
        await page.evaluate(() => ({
          phases: window.__textShaperProfile!.phases,
          measures: window.__textShaperProfile!.measures,
          tasks: window.__textShaperProfile!.longTasks,
          wasm: window.__textShaperProfile!.wasm,
          reads: window.__musartVideoReadbacks,
        })),
        null,
        2,
      ),
    );
    expect(phase.failure).toBeUndefined();
    expect(phase.canonicalAt).toBeGreaterThanOrEqual(phase.started);
    expect(phase.secondRaf).toBeGreaterThanOrEqual(phase.canonicalAt!);
    return phase;
  }
  await waitPhase();
  const cold = await textShaperSurface(page);
  expect(cold.data.projectId).toBe(project.id);
  expect(cold.data.backend).toBe("webgpu");
  expect(cold.stats.cacheBytes).toBeLessThanOrEqual(cold.stats.maxBytes!);
  const thumbnailSettlement = await page.evaluate(async () => {
    const started = performance.now();
    await window.musart!.flushThumbnails();
    return { started, ended: performance.now() };
  });
  const exportResult = await page.evaluate(async () => {
    const started = performance.now();
    const url = await window.musart!.render({ scale: 1, format: "png" });
    return { started, ended: performance.now(), url };
  });
  await writeFile(
    `${directory}/export.png`,
    Buffer.from(exportResult.url.split(",")[1]!, "base64"),
  );
  await page
    .locator(".canvas-artboard-editor canvas")
    .screenshot({ path: `${directory}/live.png` });
  // A warm update uses the most recently retained family. Cold work above is never flushed away.
  const before = await page.evaluate(() => window.musart!.snapshot());
  const beforeWarm = await textShaperSurface(page);
  await page.evaluate(
    ({ ids, text, projectId, revision }) => {
      const phase = window.__textShaperProfile!.arm("warm-text-edit", projectId, revision);
      window.musart!.execute({ type: "updateLayers", ids, patch: { text } });
      phase.published = performance.now();
    },
    {
      ids: TEXT_SHAPER_WARM_IDS,
      text: TEXT_SHAPER_WARM_TEXT,
      projectId: project.id,
      revision: before.revision + 1,
    },
  );
  await waitPhase();
  const warm = await textShaperSurface(page);
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.revision).toBe(before.revision + 1);
  expect(after.canUndo).toBe(true);
  expect(
    after.project.pages[0]!.layers.filter((layer) => TEXT_SHAPER_WARM_IDS.includes(layer.id)).every(
      (layer) => layer.text === TEXT_SHAPER_WARM_TEXT,
    ),
  ).toBe(true);
  const profile = await page.evaluate(() => ({
    phases: window.__textShaperProfile!.phases,
    measures: window.__textShaperProfile!.measures,
    longTasks: window.__textShaperProfile!.longTasks,
    adapter: window.__textShaperProfile!.adapter,
    submits: window.__textShaperProfile!.submits,
    wasm: window.__textShaperProfile!.wasm,
    resources: performance.getEntriesByType("resource").map((entry) => entry.toJSON()),
    userAgent: navigator.userAgent,
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    visibility: document.visibilityState,
  }));
  expect(profile.visibility).toBe("visible");
  const coldPhase = profile.phases[0]!,
    warmPhase = profile.phases[1]!;
  const inPhase = (name: string, phase: typeof coldPhase) =>
    profile.measures.filter(
      (entry) =>
        entry.name === name && entry.started >= phase.started && entry.started < phase.canonicalAt!,
    );
  expect(inPhase("musart:font-prepare", coldPhase).length).toBeGreaterThanOrEqual(10);
  // Marks observe all real renderer instances, including normal background thumbnails.
  const coldIds = new Set(
    inPhase("musart:text-layer-prepare", coldPhase).map((entry) => entry.detail.layerId),
  );
  expect(project.pages[0]!.layers.every((layer) => coldIds.has(layer.id))).toBe(true);
  const curvesIds = new Set(
    inPhase("musart:text-layout-curves", coldPhase).map((entry) => entry.detail.layerId),
  );
  expect(project.pages[0]!.layers.every((layer) => curvesIds.has(layer.id))).toBe(true);
  expect(inPhase("musart:font-prepare", warmPhase)).toHaveLength(0);
  const warmIds = new Set(
    inPhase("musart:text-layer-prepare", warmPhase).map((entry) => entry.detail.layerId),
  );
  expect(TEXT_SHAPER_WARM_IDS.every((id) => warmIds.has(id))).toBe(true);
  expect(profile.measures.every((entry) => !entry.detail.failed)).toBe(true);
  expect(warm.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await page.evaluate(() => window.musart!.undo());
  const undone = await page.evaluate(() => window.musart!.snapshot());
  expect(undone.project.pages).toEqual(before.project.pages);
  expect(undone.canUndo).toBe(false);
  const metrics = await cdp.send("Performance.getMetrics");
  await cdp.detach();
  await page.evaluate(() => window.__textShaperProfile!.stop());
  const inspector = await page.context().newPage();
  const decoded = await inspector.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const bytes = context.getImageData(0, 0, image.width, image.height).data;
    const cells = Array.from({ length: 150 }, () => 0);
    let hash = 2166136261;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const i = (y * image.width + x) * 4;
        for (let c = 0; c < 4; c++) hash = Math.imul(hash ^ bytes[i + c]!, 16777619);
        if (Math.min(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!) < 220)
          cells[Math.floor(y / 100) * 10 + Math.floor(x / 160)]!++;
      }
    return { width: image.width, height: image.height, hash: hash >>> 0, cells };
  }, exportResult.url);
  await inspector.close();
  expect(decoded.width).toBe(1600);
  expect(decoded.height).toBe(1500);
  expect(decoded.cells.every((ink) => ink > 25)).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(
    `${directory}/report.json`,
    JSON.stringify(
      {
        schema: "native-text-shaping-v1",
        sourceSha: process.env.MUSART_TEXT_SHA,
        method: process.env.MUSART_TEXT_METHOD,
        run: process.env.MUSART_TEXT_RUN,
        fixtureSha,
        browser: browser.version(),
        bootstrap,
        cold,
        thumbnailSettlement,
        beforeWarm,
        warm,
        export: { started: exportResult.started, ended: exportResult.ended },
        decoded,
        ...profile,
        metrics,
        errors,
      },
      null,
      2,
    ),
  );
});
