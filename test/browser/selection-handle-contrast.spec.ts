import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { interactionEnvironment } from "./support/interaction-probe";

interface Handle {
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  filter: string;
}
interface Shot {
  name: string;
  url: string;
  width: number;
  height: number;
  handles: Handle[];
}

async function nativeEnvironment(page: Page) {
  const result = await interactionEnvironment(page);
  const webgl =
    result.backend === "webgl"
      ? await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
          const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
          if (!context) return null;
          const debug = context.getExtension("WEBGL_debug_renderer_info");
          return {
            renderer: String(
              context.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER),
            ),
            vendor: String(context.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR)),
          };
        })
      : null;
  return { ...result, webgl };
}

async function ready(page: Page, count = 1) {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.theme", "dark"));
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  const target = createLayer("rectangle", {
    id: "contrast-target",
    name: "Contrast target",
    x: 120,
    y: 180,
    width: 400,
    height: 120,
    fill: "#ffffff00",
    strokeWidth: 0,
  });
  const extras = Array.from({ length: count - 1 }, (_, index) =>
    createLayer("rectangle", {
      id: `contrast-${index}`,
      x: 260 + (index % 8) * 12,
      y: 340 + Math.floor(index / 8) * 12,
      width: 8,
      height: 8,
      fill: "#ffffff00",
      strokeWidth: 0,
    }),
  );
  const layers = [
    createLayer("rectangle", {
      id: "white-backdrop",
      x: 0,
      y: 0,
      width: 220,
      height: 480,
      fill: "#ffffff",
      strokeWidth: 0,
    }),
    createLayer("rectangle", {
      id: "black-backdrop",
      x: 420,
      y: 0,
      width: 220,
      height: 480,
      fill: "#000000",
      strokeWidth: 0,
    }),
    ...extras,
    target,
  ];
  const project = createProject({
    id: crypto.randomUUID(),
    pages: [
      createPage({
        id: "contrast-page",
        width: 640,
        height: 480,
        background: "#808080",
        layers,
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 5, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: layers.map((layer) => ({
            id: `track-${layer.id}`,
            layerId: layer.id,
            start: { value: 0, rate: 1 },
            end: null,
            properties: [],
          })),
        },
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["contrast-target"]);
  }, project);
  await page.waitForFunction(
    () =>
      Boolean(document.querySelector('.canvas-artboard canvas[data-renderer-ready="true"]')) &&
      document.querySelectorAll(".canvas-handle").length === 5,
  );
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
  await page.waitForFunction(() => {
    const dock = document.querySelector<HTMLElement>(".motion-timeline-dock")!;
    return dock.dataset.motionPinned === "true" && !dock.hasAttribute("data-motion-animating");
  });
  return [...extras.map((layer) => layer.id), target.id];
}

async function capture(page: Page, name: string, selector: string): Promise<Shot> {
  const data = await page.evaluate(
    (selector) => ({
      width: innerWidth,
      height: innerHeight,
      handles: [...document.querySelectorAll<HTMLElement>(selector)].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          kind:
            node.dataset.handle ??
            [...node.classList].find((value) => value.startsWith("is-"))?.slice(3) ??
            "unknown",
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          filter: getComputedStyle(node).backdropFilter,
        };
      }),
    }),
    selector,
  );
  expect(data.handles.length).toBeGreaterThan(0);
  for (const handle of data.handles) expect(handle.filter).toContain("contrast(1000)");
  await mkdir("artifacts/motion/ui", { recursive: true });
  const png = await page.screenshot({ path: `artifacts/motion/ui/handles-${name}.png` });
  return { name, ...data, url: `data:image/png;base64,${png.toString("base64")}` };
}

/** Only the isolated screenshot inspector reads pixels; the production page keeps its probe. */
async function inspect(page: Page, shots: Shot[]) {
  const inspector = await page.context().newPage();
  try {
    return await inspector.evaluate(async (shots) => {
      const result: { name: string; handles: { kind: string; mean: number[] }[] }[] = [];
      for (const shot of shots) {
        const image = new Image();
        image.src = shot.url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const scaleX = canvas.width / shot.width,
          scaleY = canvas.height / shot.height;
        const handles = shot.handles.map((handle) => {
          const mean = [0, 0, 0];
          let count = 0;
          const left = Math.round((handle.x + 2) * scaleX),
            right = Math.round((handle.x + handle.width - 2) * scaleX);
          const top = Math.round((handle.y + 2) * scaleY),
            bottom = Math.round((handle.y + handle.height - 2) * scaleY);
          for (let y = top; y < Math.max(top + 1, bottom); y++)
            for (let x = left; x < Math.max(left + 1, right); x++) {
              const offset = (y * canvas.width + x) * 4;
              for (let channel = 0; channel < 3; channel++)
                mean[channel]! += pixels[offset + channel]!;
              count++;
            }
          return { kind: handle.kind, mean: mean.map((value) => value / count) };
        });
        result.push({ name: shot.name, handles });
      }
      return result;
    }, shots);
  } finally {
    await inspector.close();
  }
}

test("paused selection and hover handles adapt to real canvas pixels in both themes without production readbacks", async ({
  page,
}) => {
  await ready(page);
  const shots: Shot[] = [];
  const normal = '.canvas-selection[data-layer-id="contrast-target"] .canvas-handle';
  shots.push(await capture(page, "selected-dark", normal));
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  });
  shots.push(await capture(page, "selected-light", normal));
  const row = page.locator('.motion-row[data-layer-id="contrast-target"]').first();
  await row.hover();
  await expect(page.locator(".canvas-timeline-hover")).toBeHidden();
  await page.evaluate(() => window.musart!.select([]));
  await page.mouse.move(300, 80);
  await row.hover();
  await expect(
    page.locator('.canvas-timeline-hover[data-layer-id="contrast-target"]'),
  ).toBeVisible();
  shots.push(await capture(page, "hover-light", ".canvas-timeline-hover-handle"));
  const environment = await nativeEnvironment(page);
  const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(environment.backend).toMatch(/^(webgpu|webgl)$/);
  expect(readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  const optical = await inspect(page, shots);
  for (const shot of optical)
    for (const handle of shot.handles) {
      const brightness = handle.mean.reduce((sum, value) => sum + value, 0) / 3;
      expect(Math.max(...handle.mean) - Math.min(...handle.mean)).toBeLessThan(12);
      if (handle.kind === "nw" || handle.kind === "sw") expect(brightness).toBeLessThan(40);
      else if (handle.kind === "ne" || handle.kind === "se")
        expect(brightness).toBeGreaterThan(215);
      else expect(Math.min(brightness, 255 - brightness)).toBeLessThan(40);
    }
  await writeFile(
    "artifacts/motion/ui/handle-contrast-optical.json",
    JSON.stringify(
      { environment, readbacks, optical, styles: shots.map(({ url: _url, ...shot }) => shot) },
      null,
      2,
    ),
  );
});

test("64 selected layers and playback retain two-tone handles without per-handle filters", async ({
  page,
}) => {
  const ids = await ready(page, 64);
  await page.locator('.motion-row[data-layer-id="contrast-62"]').first().hover();
  await page.waitForFunction(() => {
    const hover = document.querySelector<HTMLElement>(
      '.canvas-timeline-hover[data-layer-id="contrast-62"]',
    );
    return hover && getComputedStyle(hover).display !== "none";
  });
  const pausedFilterCount = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll<HTMLElement>(".canvas-handle,.canvas-timeline-hover-handle"),
      ].filter((node) => getComputedStyle(node).backdropFilter !== "none").length,
  );
  expect(pausedFilterCount).toBe(9);
  await page.evaluate((ids) => window.musart!.select(ids), ids);
  await page.waitForFunction(
    () =>
      document.querySelector(".canvas-selection-overlays")?.getAttribute("data-selection-count") ===
        "64" && document.querySelectorAll(".canvas-handle").length === 320,
  );
  const bulk = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".canvas-handle")].map((node) => {
      const style = getComputedStyle(node);
      return {
        filter: style.backdropFilter,
        background: style.backgroundColor,
        border: style.borderTopColor,
        shadow: style.boxShadow,
      };
    }),
  );
  expect(new Set(bulk.map((handle) => handle.filter))).toEqual(new Set(["none"]));
  expect(new Set(bulk.map((handle) => handle.background))).toEqual(new Set(["rgb(255, 255, 255)"]));
  expect(new Set(bulk.map((handle) => handle.border))).toEqual(new Set(["rgb(255, 255, 255)"]));
  expect(bulk.every((handle) => handle.shadow.includes("rgb(0, 0, 0)"))).toBe(true);
  const bulkFilterCount = await page.evaluate(
    () =>
      [
        ...document.querySelectorAll<HTMLElement>(".canvas-handle,.canvas-timeline-hover-handle"),
      ].filter((node) => getComputedStyle(node).backdropFilter !== "none").length,
  );
  expect(bulkFilterCount).toBe(0);
  await page.evaluate(() => window.musart!.select(["contrast-target"]));
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>(".canvas-selection-overlays")?.dataset.playback ===
      "true",
  );
  const playback = await page.evaluate(() => ({
    handles: [...document.querySelectorAll<HTMLButtonElement>(".canvas-handle")].map((node) => ({
      filter: getComputedStyle(node).backdropFilter,
      disabled: node.disabled,
    })),
    opacity: document.querySelector<HTMLElement>(
      '.canvas-selection[data-layer-id="contrast-target"]',
    )!.style.opacity,
    readbacks: window.__musartVideoReadbacks,
  }));
  expect(playback.handles).toHaveLength(5);
  expect(playback.handles.every((handle) => handle.filter === "none" && handle.disabled)).toBe(
    true,
  );
  expect(playback.opacity).toBe("0.2");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(playback.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await mkdir("artifacts/motion/ui", { recursive: true });
  await writeFile(
    "artifacts/motion/ui/handle-contrast-bounds.json",
    JSON.stringify(
      {
        environment: await nativeEnvironment(page),
        pausedFilterCount,
        bulkFilterCount,
        bulk,
        playback,
      },
      null,
      2,
    ),
  );
});
