import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { zoomViewport } from "./support/viewport";
import { installReadbackProbe } from "./support/readback-probe";
import { mkdir, writeFile } from "node:fs/promises";

test("viewport travel stays bounded and measurement badges remain readable at every zoom and theme", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layer = createLayer("rectangle", {
    id: "guide-witness",
    name: "Guide witness",
    x: 63,
    y: 83,
    width: 200,
    height: 120,
    fill: "#2463eb",
  });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["guide-witness"]);
    },
    createProject({
      pages: [
        createPage({
          width: 640,
          height: 480,
          background: "#f2eee7",
          layers: [
            layer,
            createLayer("rectangle", {
              id: "alignment-reference",
              x: 63,
              y: 266,
              width: 200,
              height: 40,
              fill: "#737378",
            }),
          ],
        }),
      ],
    }),
  );
  const canvas = page.getByTestId("editor-canvas"),
    artboard = page.getByTestId("artboard"),
    reset = page.getByRole("button", { name: "100 % · Recentrer", exact: true });
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await reset.click();
  await canvas.hover({ position: { x: 300, y: 200 } });
  await page.mouse.wheel(180, 100);
  await expect(artboard).toHaveAttribute("data-pan-x", "-90");
  await expect(artboard).toHaveAttribute("data-pan-y", "-50");
  const recenter = page.getByRole("button", { name: "Recentrer la vue", exact: true });
  const surfaces = await page.evaluate(() => {
    const controls = document.querySelector<HTMLElement>(".canvas-controls")!,
      recenter = document.querySelector<HTMLElement>(".canvas-recenter")!;
    return [controls, recenter, controls.querySelector("button")!].map((element) => {
      const style = getComputedStyle(element),
        rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        bottom: rect.bottom,
        background: style.backgroundColor,
        blur: style.backdropFilter,
      };
    });
  });
  expect(surfaces[0]!.height).toBe(40);
  expect(surfaces[1]!.height).toBe(surfaces[2]!.height);
  expect(surfaces[1]!.height).toBe(32);
  expect(surfaces[1]!.bottom).toBe(surfaces[2]!.bottom);
  expect(surfaces[1]!.background).toBe(surfaces[0]!.background);
  expect(surfaces[1]!.blur).toBe(surfaces[0]!.blur);
  expect(surfaces[0]!.blur).toContain("blur(20px)");
  await page.mouse.wheel(10000, -10000);
  await expect(artboard).toHaveAttribute("data-pan-x", "-240");
  await expect(artboard).toHaveAttribute("data-pan-y", "240");
  await recenter.click();
  await expect(artboard).toHaveAttribute("data-pan-x", "0");
  await expect(artboard).toHaveAttribute("data-pan-y", "0");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const zoom of [1, 2, 0.25]) {
      await reset.click();
      await expect(artboard).toHaveAttribute("data-view-moving", "false");
      if (zoom !== 1) {
        await canvas.hover({ position: { x: 400, y: 300 } });
        await zoomViewport(page, zoom);
      }
      const badges = page.locator(".measurement-label-background");
      await expect(badges).toHaveCount(0);
      const bounds = (await artboard.boundingBox())!,
        start = { x: bounds.x + 163 * zoom, y: bounds.y + 143 * zoom };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 2, start.y);
      await expect(page.locator('[data-snap-target="alignment-reference"]')).toHaveCount(1);
      await expect(badges).toHaveCount(1);
      for (const badge of await badges.all())
        expect((await badge.boundingBox())!.height).toBeCloseTo(19, 2);
      const label = page.locator(".canvas-measurement-label text").filter({ hasText: /^63$/ });
      await expect(label).toHaveCount(1);
      const typography = await label.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fill: style.fill,
          color: style.color,
          stroke: style.stroke,
          weight: style.fontWeight,
        };
      });
      expect(typography.fill).toBe(typography.color);
      expect(typography.stroke).toBe("none");
      expect(typography.weight).toBe("600");
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(badges).toHaveCount(0);
      expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    }
    await reset.click();
    await expect(artboard).toHaveAttribute("data-view-moving", "false");
    await page.screenshot({ path: `artifacts/screenshots/viewport-guides-${theme}.png` });
  }
});

test("smooth wheel zoom preserves its anchor without React frame commits and cancels cleanly", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          width: 800,
          height: 600,
          layers: [
            createLayer("rectangle", { x: 50, y: 50, width: 200, height: 150, fill: "#2463eb" }),
          ],
        }),
      ],
    }),
  );
  const canvas = page.getByTestId("editor-canvas"),
    artboard = page.getByTestId("artboard");
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  await expect(artboard).toHaveAttribute("data-view-moving", "false");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 40);
  const baseline = await page.evaluate(() => ({
    revision: window.musart!.snapshot().revision,
    commits: Number(document.querySelector<HTMLElement>(".editor-canvas")!.dataset.reactRenders),
    stats: JSON.parse(
      document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!.dataset.gpuStats!,
    ) as { uploads: number },
  }));
  const sampling = page.evaluate(
    () =>
      new Promise<
        { time: number; zoom: number; x: number; y: number; moving: boolean; commits: number }[]
      >((resolve) => {
        const frames: {
            time: number;
            zoom: number;
            x: number;
            y: number;
            moving: boolean;
            commits: number;
          }[] = [],
          start = performance.now();
        const sample = () => {
          const board = document.querySelector<HTMLElement>('[data-testid="artboard"]')!,
            root = document.querySelector<HTMLElement>(".editor-canvas")!;
          frames.push({
            time: performance.now() - start,
            zoom: Number(board.dataset.zoom),
            x: Number(board.dataset.panX),
            y: Number(board.dataset.panY),
            moving: board.dataset.viewMoving === "true",
            commits: Number(root.dataset.reactRenders),
          });
          if (performance.now() - start < 380) requestAnimationFrame(sample);
          else resolve(frames);
        };
        requestAnimationFrame(sample);
      }),
  );
  const anchorCapture = page.evaluate(
    () =>
      new Promise<{ x: number; y: number }>((resolve) => {
        const root = document.querySelector<HTMLElement>(".editor-canvas")!;
        root.addEventListener(
          "wheel",
          (event) => {
            const rect = root.getBoundingClientRect();
            resolve({
              x: event.clientX - rect.left - rect.width / 2,
              y: event.clientY - rect.top - rect.height / 2,
            });
          },
          { once: true, capture: true },
        );
      }),
  );
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -10000);
  await page.keyboard.up("Control");
  const anchor = await anchorCapture,
    frames = await sampling,
    target = Math.exp(0.16),
    animated = frames.filter((frame) => frame.moving);
  expect(animated.length).toBeGreaterThan(3);
  for (const [index, frame] of frames.entries()) {
    expect(frame.zoom).toBeGreaterThanOrEqual(index ? frames[index - 1]!.zoom - 1e-7 : 1);
    expect(frame.zoom).toBeLessThanOrEqual(target + 1e-6);
    expect((anchor.x - frame.x) / frame.zoom).toBeCloseTo(anchor.x, 5);
    expect((anchor.y - frame.y) / frame.zoom).toBeCloseTo(anchor.y, 5);
    if (frame.moving) expect(frame.commits).toBe(baseline.commits);
  }
  expect(frames.at(-1)!.zoom).toBeCloseTo(target, 5);
  expect(frames.at(-1)!.commits).toBe(baseline.commits + 1);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -80);
  await page.keyboard.up("Control");
  await expect(artboard).toHaveAttribute("data-view-moving", "true");
  await page.mouse.wheel(30, 20);
  await expect(artboard).toHaveAttribute("data-view-moving", "false");
  const interrupted = await artboard.getAttribute("data-zoom");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const start = performance.now();
        const wait = () =>
          performance.now() - start >= 200 ? resolve() : requestAnimationFrame(wait);
        requestAnimationFrame(wait);
      }),
  );
  await expect(artboard).toHaveAttribute("data-zoom", interrupted!);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -80);
  await page.keyboard.up("Control");
  await expect(artboard).toHaveAttribute("data-view-moving", "true");
  await page.mouse.click(box.x + box.width / 2 + 100, box.y + box.height / 2 + 40);
  await expect(artboard).toHaveAttribute("data-view-moving", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  await expect(artboard).toHaveAttribute("data-zoom", "1");
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -40);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    () => Number(document.querySelector<HTMLElement>('[data-testid="artboard"]')!.dataset.zoom) > 1,
  );
  expect(await artboard.getAttribute("data-view-moving")).toBe("false");
  const final = await page.evaluate(() => ({
    revision: window.musart!.snapshot().revision,
    reads: window.__musartVideoReadbacks!,
    stats: JSON.parse(
      document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!.dataset.gpuStats!,
    ) as { uploads: number },
  }));
  expect(final.revision).toBe(baseline.revision);
  expect(final.stats.uploads).toBe(baseline.stats.uploads);
  expect({ gpu: final.reads.gpu, webgl: final.reads.webgl, canvas: final.reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/viewport-motion.json",
    JSON.stringify(
      { browser: page.context().browser()!.version(), frames, baseline, final },
      null,
      2,
    ),
  );
});
