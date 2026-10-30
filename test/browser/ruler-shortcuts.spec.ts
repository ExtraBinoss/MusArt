import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

for (const workload of ["default", "images-50"] as const)
  test(`ruler shortcut bursts retain ticks and GPU input, suppress native repeats and preserve history: ${workload}`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    await installReadbackProbe(page);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto(workload === "images-50" ? "/?automation=1&benchmark=50" : "/?automation=1");
    await page.waitForFunction(() => !!window.musart);
    if (workload === "default")
      await page.evaluate(() => window.musart!.load(window.musart!.snapshot().project));
    const canvas = page.locator(".canvas-artboard canvas");
    const ready = () =>
      page.waitForFunction(() => {
        const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
        return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
      });
    await ready();
    await page.evaluate(() =>
      window.musart!.execute({ type: "updatePage", patch: { rulers: false } }),
    );
    await ready();
    await page.keyboard.press("Control+r");
    await expect(page.locator(".canvas-rulers")).toBeVisible();
    await ready();
    const pixels = await canvas.screenshot();
    const original = await page.evaluate(() => {
      const snapshot = window.musart!.snapshot(),
        page = snapshot.project.pages.find((p) => p.id === snapshot.pageId)!;
      return {
        revision: snapshot.revision,
        images: page.layers.filter((l) => l.kind === "image").length,
        effects: page.layers.flatMap((l) => l.effects).length,
      };
    });
    if (workload === "images-50") expect(original).toMatchObject({ images: 50, effects: 100 });
    await page.evaluate(() => {
      const tick = document.querySelector<HTMLElement>(".canvas-rulers g[data-value]")!;
      tick.setAttribute("data-retained-ruler", "yes");
      const probe = {
        removed: 0,
        latencies: [] as number[],
        keys: [] as { repeat: boolean; prevented: boolean }[],
        longTasks: [] as number[],
      };
      Object.assign(window, { rulerBurst: probe });
      const observer = new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.removedNodes)
            if (node instanceof Element)
              probe.removed +=
                Number(node.matches("g[data-value]")) +
                node.querySelectorAll("g[data-value]").length;
      });
      observer.observe(document.querySelector(".canvas-rulers")!, {
        subtree: true,
        childList: true,
      });
      const starts = new WeakMap<Event, number>();
      document.addEventListener("keydown", (event) => starts.set(event, performance.now()), true);
      document.addEventListener("keydown", (event) => {
        if (!event.ctrlKey || event.key !== "r") return;
        probe.keys.push({ repeat: event.repeat, prevented: event.defaultPrevented });
        const start = starts.get(event)!;
        requestAnimationFrame(() => probe.latencies.push(performance.now() - start));
      });
      new PerformanceObserver((list) =>
        probe.longTasks.push(...list.getEntries().map((entry) => entry.duration)),
      ).observe({ type: "longtask" });
    });
    const state = () =>
      page.evaluate(() => ({
        stats: JSON.parse(
          document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!.dataset.gpuStats!,
        ) as Record<string, number>,
        commits: [
          ...document.querySelectorAll(
            ".musart-app,.canvas-area,.editor-canvas,.editor-gpu-scene,.inspector",
          ),
        ].map((node) => [node.className, node.getAttribute("data-react-renders")]),
      }));
    const before = await state();
    for (let at = 0; at < 30; at++) await page.keyboard.press("Control+r");
    await ready();
    await expect(page.locator("[data-retained-ruler=yes]")).toHaveCount(1);
    await expect(page.locator(".canvas-rulers")).toBeVisible();
    expect(await canvas.screenshot()).toEqual(pixels);
    const after = await state();
    for (const metric of ["frames", "passes", "uploads", "targets", "cacheBytes"])
      expect(after.stats[metric], metric).toBe(before.stats[metric]);
    expect(after.commits).toEqual(before.commits);
    expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(
      original.revision + 30,
    );
    await page.keyboard.down("Control");
    await page.keyboard.down("r");
    for (let at = 0; at < 40; at++) await page.keyboard.down("r");
    await page.keyboard.up("r");
    await page.keyboard.up("Control");
    await expect(page.locator(".canvas-rulers")).toBeHidden();
    expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(
      original.revision + 31,
    );
    const probe = await page.evaluate(
      () =>
        (
          window as unknown as {
            rulerBurst: {
              removed: number;
              latencies: number[];
              keys: { repeat: boolean; prevented: boolean }[];
              longTasks: number[];
            };
          }
        ).rulerBurst,
    );
    expect(probe.removed).toBe(0);
    expect(probe.keys.filter((key) => key.repeat)).toHaveLength(40);
    expect(probe.keys.every((key) => key.prevented)).toBe(true);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".canvas-rulers")).toBeVisible();
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".canvas-rulers")).toBeHidden();
    await page.keyboard.press("Control+r");
    await expect(page.locator(".canvas-rulers")).toBeVisible();
    await page.evaluate(() =>
      window.musart!.execute({ type: "updatePage", patch: { background: "#142334" } }),
    );
    await ready();
    expect((await state()).stats.frames).toBeGreaterThan(after.stats.frames);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    const environment = await page.evaluate(async () => ({
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      viewport: [innerWidth, innerHeight],
      backend:
        document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset.backend,
      adapter: (await navigator.gpu?.requestAdapter())?.info,
    }));
    await mkdir("artifacts/ruler-spam", { recursive: true });
    await writeFile(
      `artifacts/ruler-spam/${workload}.json`,
      JSON.stringify({ browser: browser.version(), environment, before, after, probe }, null, 2),
    );
  });

test("ruler spam does not interrupt Motion playback", async ({ page }) => {
  const { fixture } = await import("./support/motion-canvas");
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate((project) => window.musart!.load(project), fixture());
  const play = page.getByRole("button", { name: "Play", exact: true });
  await play.click();
  for (let at = 0; at < 20; at++) await page.keyboard.press("Control+r");
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  await expect(pause).toBeVisible();
  await pause.click();
});
