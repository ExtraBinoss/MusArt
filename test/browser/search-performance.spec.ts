import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createProject } from "@musart/core";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { installReadbackProbe } from "./support/readback-probe";
import { installSearchProfile, searchSurfaceCounters } from "./support/search-profile";
import { visibleThumbnailsReady, profileClock } from "./support/selection-profile";

async function open(page: Page) {
  await page.keyboard.press("Control+k");
  await page.waitForFunction(() => {
    const sample = window.__searchProfile!.samples.at(-1);
    const input = document.querySelector('[data-magic-search] [role="combobox"]');
    return sample?.kind === "open" && Boolean(sample.settledAt) && document.activeElement === input;
  });
}

test("CmdK native production profile: immediate input after a committed 150-layer edit", async ({
  page,
  browser,
}) => {
  const directory = process.env.MUSART_CMDK_OUTPUT ?? "artifacts/cmdk-profile/current";
  await mkdir(directory, { recursive: true });
  await installReadbackProbe(page);
  await installSearchProfile(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let sequence = 0;
  const project = createProject({
    id: "cmdk-post-edit-project",
    name: "AFTERHOURS — pending edit",
    pages: [createTechnoArtboard(() => `cmdk-post-edit-${++sequence}`)],
  });
  const ids = project.pages[0]!.layers.map((layer) => layer.id);
  expect(ids).toHaveLength(150);
  await page.evaluate((project) => window.musart!.load(project), project);
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
    return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
  });
  await page.evaluate(() => window.musart!.flushThumbnails());
  await visibleThumbnailsReady(page);
  await page.bringToFront();
  const before = await page.evaluate(() => window.musart!.snapshot());
  expect(before.canUndo).toBe(false);
  // No snapshot, flush, idle wait or thumbnail settlement between commit and input.
  const edit = await page.evaluate((ids) => {
    const started = performance.now();
    window.musart!.execute({ type: "updateLayers", ids, patch: { opacity: 0.9 } });
    return { started, returned: performance.now() };
  }, ids);
  await page.keyboard.press("Control+k");
  await page.waitForFunction(() =>
    document.activeElement?.matches('[data-magic-search] [role="combobox"]'),
  );
  await typeQuery(page, "layer");
  const sample = await page.evaluate(() => ({
    samples: window.__searchProfile!.samples,
    tasks: window.__searchProfile!.longTasks,
    adapter: window.__searchProfile!.adapter,
    now: performance.now(),
  }));
  await close(page);
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.revision).toBe(before.revision + 1);
  expect(after.canUndo).toBe(true);
  expect(after.project.pages[0]!.layers.every((layer) => layer.opacity === 0.9)).toBe(true);
  await page.evaluate(() => window.musart!.undo());
  const undone = await page.evaluate(() => window.musart!.snapshot());
  expect(undone.canUndo).toBe(false);
  expect(undone.project.pages).toEqual(before.project.pages);
  await writeFile(
    join(directory, "post-edit-150.json"),
    JSON.stringify(
      {
        frozenSha: process.env.MUSART_CMDK_SHA,
        browser: browser.version(),
        edit,
        expectedRevision: before.revision + 1,
        actualRevision: after.revision,
        restoredAfterOneUndo: true,
        ...sample,
        counters: await searchSurfaceCounters(page),
      },
      null,
      2,
    ),
  );
});
async function close(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-magic-search]")).toHaveCount(0);
}
async function typeQuery(page: Page, query: string) {
  await page.keyboard.type(query, { delay: 20 });
  await page.waitForFunction((value) => {
    const sample = window.__searchProfile!.samples.at(-1);
    return sample?.kind === "input" && sample.value === value;
  }, query);
  const last = await page.evaluate(() => window.__searchProfile!.samples.at(-1)!);
  expect(last.observedValue).toBe(query);
  if (query === "zzzznone") {
    expect(last.options).toBe(0);
    expect(last.resultText).toContain("Aucun résultat.");
  } else expect(last.options).toBeGreaterThan(0);
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

for (const workload of ["afterhours-150", "images-50-effects-100"] as const) {
  test(`CmdK native production profile: ${workload}`, async ({ page, browser }, testInfo) => {
    test.setTimeout(180000);
    const directory = process.env.MUSART_CMDK_OUTPUT ?? "artifacts/cmdk-profile/current";
    await mkdir(directory, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await installSearchProfile(page);
    await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
    const preparationStarted = Date.now();
    await page.goto(
      workload === "afterhours-150" ? "/?automation=1" : "/?automation=1&benchmark=50",
    );
    await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 120000 });
    if (workload === "afterhours-150") {
      let sequence = 0;
      const project = createProject({
        id: "cmdk-afterhours-150",
        name: "AFTERHOURS — 150 editable layers",
        pages: [createTechnoArtboard(() => `cmdk-layer-${++sequence}`)],
      });
      await page.evaluate((project) => window.musart!.load(project), project);
    }
    await page.waitForFunction(
      () => {
        const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
        return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
      },
      undefined,
      { timeout: 120000 },
    );
    await page.evaluate(() => window.musart!.flushThumbnails());
    await visibleThumbnailsReady(page);
    await page.bringToFront();
    const documentBefore = await page.evaluate(() => window.musart!.snapshot());
    const allLayers = documentBefore.project.pages.flatMap((page) => page.layers);
    if (workload === "afterhours-150") expect(allLayers).toHaveLength(150);
    else {
      expect(allLayers.filter((layer) => layer.kind === "image")).toHaveLength(50);
      expect(allLayers.reduce((sum, layer) => sum + layer.effects.length, 0)).toBe(100);
    }
    const preparationMs = Date.now() - preparationStarted;
    const environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      viewport: { width: innerWidth, height: innerHeight },
      dpr: devicePixelRatio,
      visibility: document.visibilityState,
      adapter: window.__searchProfile!.adapter,
      hardwareConcurrency: navigator.hardwareConcurrency,
    }));
    const before = await searchSurfaceCounters(page);
    const start = await page.evaluate(() => performance.now());
    // First palette opening is genuinely cold. Fixture loading never opens CmdK.
    await open(page);
    await typeQuery(page, "flou");
    await close(page);
    for (const query of ["layer", "zzzznone", "flou", "layer", "zzzznone", "flou"]) {
      await open(page);
      await typeQuery(page, query);
      await close(page);
    }
    const end = await page.evaluate(() => performance.now());
    const measured = await page.evaluate(
      ({ start, end }) => ({
        samples: window.__searchProfile!.samples.filter(
          (sample) => sample.dispatch >= start && sample.dispatch <= end,
        ),
        longTasks: window.__searchProfile!.longTasks.filter(
          (task) => task.start >= start && task.start <= end,
        ),
      }),
      { start, end },
    );
    const after = await searchSurfaceCounters(page);
    expect(after.commits).toEqual(before.commits);
    expect(after.instances).toBe(before.instances);
    for (const key of ["gpu", "webgl", "canvas", "videoFrame"] as const)
      expect(after.readbacks[key] - before.readbacks[key]).toBe(0);
    const documentAfter = await page.evaluate(() => window.musart!.snapshot());
    expect(digest(documentAfter.project)).toBe(digest(documentBefore.project));
    expect(documentAfter.revision).toBe(documentBefore.revision);
    // Diagnostic CPU capture is separate from the unprofiled timing samples above.
    const session = await page.context().newCDPSession(page);
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 1000 });
    const clock = await profileClock(session, page);
    await session.send("Tracing.start", {
      categories: "devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking",
      transferMode: "ReturnAsStream",
    });
    await session.send("Profiler.start");
    const diagnosticStart = await page.evaluate(() => performance.now());
    await open(page);
    await typeQuery(page, "flou");
    await close(page);
    const diagnosticEnd = await page.evaluate(() => performance.now());
    const { profile } = await session.send("Profiler.stop");
    const tracingComplete = new Promise<{ stream?: string }>((resolve) =>
      session.once("Tracing.tracingComplete", resolve),
    );
    await session.send("Tracing.end");
    const { stream } = await tracingComplete;
    if (!stream) throw new Error("Chrome did not retain its diagnostic trace.");
    let trace = "";
    for (;;) {
      const chunk = await session.send("IO.read", { handle: stream });
      trace += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString() : chunk.data;
      if (chunk.eof) break;
    }
    await session.send("IO.close", { handle: stream });
    await writeFile(join(directory, `${workload}.trace.json`), trace);
    await session.detach();
    await writeFile(join(directory, `${workload}.cpuprofile`), JSON.stringify(profile));
    const result = {
      frozenSha: process.env.MUSART_CMDK_SHA,
      url: page.url(),
      workload,
      browser: browser.version(),
      environment,
      preparationMs,
      layers: allLayers.length,
      effects: allLayers.reduce((sum, layer) => sum + layer.effects.length, 0),
      before,
      after,
      start,
      end,
      ...measured,
      diagnostic: { start: diagnosticStart, end: diagnosticEnd, clock },
      unchangedDocument: digest(documentBefore.project),
      errors,
    };
    await writeFile(join(directory, `${workload}.json`), JSON.stringify(result, null, 2));
    await page.screenshot({ path: join(directory, `${workload}.png`) });
    await testInfo.attach("cmdk-profile", {
      body: JSON.stringify(result),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });
}
