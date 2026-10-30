import { expect as baseExpect, type Browser, type Page } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  type MotionLayerTrack,
  type Project,
} from "@musart/core";

export const output = "artifacts/motion/canvas-native";
const expect = baseExpect.configure({ timeout: 3500 });
export const surface = 'canvas[data-timeline-canvas="true"]';
export const viewport = ".motion-timeline-scroll";
const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
const time = (value: number, rate = 1) => ({ value, rate });

export function fixture(rows = 2): Project {
  // Hidden artwork avoids turning this timeline test into a thousand-source GPU load test.
  const fillers = Array.from({ length: rows - 2 }, (_, index) =>
    createLayer("rectangle", { id: `filler-${index}`, name: `Row ${index}`, visible: false }),
  );
  const card = createLayer("rectangle", {
    id: "card",
    name: "Canvas card",
    x: 40,
    y: 50,
    width: 100,
    height: 70,
    fill: "#9775d8",
  });
  const tracks: MotionLayerTrack[] = fillers.map((layer) => ({
    id: `${layer.id}-track`,
    layerId: layer.id,
    start: time(0),
    end: null,
    properties: [],
  }));
  tracks.push(
    ...[0, 1].map((occurrence): MotionLayerTrack => {
      const offset = occurrence * 9;
      return {
        id: occurrence ? "card-second" : "card-first",
        layerId: card.id,
        start: time(1 + offset),
        end: time(6 + offset),
        properties: [
          {
            id: occurrence ? "card-second-x" : "card-x",
            target: { kind: "layer", layerId: card.id, property: "x" },
            keyframes: [
              { id: occurrence ? "second-first" : "first", time: time(1 + offset), value: 40 },
              { id: occurrence ? "second-middle" : "middle", time: time(3 + offset), value: 100 },
              { id: occurrence ? "second-last" : "last", time: time(5 + offset), value: 160 },
            ],
          },
        ],
      };
    }),
  );
  return createProject({
    id: crypto.randomUUID(),
    name: "Canvas timeline witness",
    pages: [
      createPage({
        id: "canvas-page",
        width: 320,
        height: 200,
        layers: [...fillers, card],
        motion: {
          version: 2,
          initialized: true,
          mode: "motion",
          duration: time(30),
          frameRate: { numerator: 30, denominator: 1 },
          tracks,
        },
      }),
    ],
  });
}

export function reorderFixture(): Project {
  const project = fixture(),
    page = project.pages[0]!;
  page.layers.unshift(
    createLayer("ellipse", {
      id: "peer",
      name: "Canvas peer",
      x: 80,
      y: 60,
      width: 100,
      height: 70,
      fill: "#df9678",
    }),
  );
  page.motion!.tracks.unshift({
    id: "peer-track",
    layerId: "peer",
    start: { value: 0, rate: 1 },
    end: null,
    properties: [],
  });
  return project;
}

export async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
export async function counters(page: Page) {
  return page.evaluate(
    (selectors) =>
      selectors.map((selector) => {
        const text = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
        if (text === undefined) throw Error(`Missing actual React counter ${selector}`);
        return Number(text);
      }),
    roots,
  );
}
export async function prepare(page: Page, project: Project) {
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 20_000 });
  await page.evaluate((project) => window.musart!.load(project), project);
  await readyTimeline(page);
}
/** Gallery loading resolves and verifies the originals omitted from portable JSON snapshots. */
export async function prepareTemplate(page: Page, name: string) {
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 20_000 });
  if (!(await page.getByRole("tab", { name: "Templates", exact: true }).count()))
    await page.getByRole("button", { name: "Menu du projet", exact: true }).click();
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await readyTimeline(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function readyTimeline(page: Page) {
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20_000,
  });
  const pin = page.getByRole("button", { name: "Épingler la timeline", exact: true });
  if (await pin.isVisible()) await pin.click();
  await expect(page.locator(".motion-timeline-dock")).toHaveAttribute("data-motion-pinned", "true");
  await expect(page.locator(surface)).toBeVisible();
  await expect
    .poll(() => page.locator(surface).getAttribute("data-timeline-paints"))
    .not.toBeNull();
  await frames(page);
}
export async function point(page: Page, label: string, seconds: number, offsetY = 0) {
  const row = page.locator(label).first();
  await expect(row).toBeVisible();
  return row.evaluate(
    (node, { surface, viewport, seconds, offsetY }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(surface)!;
      const scroll = document.querySelector<HTMLElement>(viewport)!;
      const scale = Number(
        document.querySelector('[aria-label="Zoom de la timeline"]')!.getAttribute("aria-valuenow"),
      );
      const box = canvas.getBoundingClientRect(),
        row = node.getBoundingClientRect();
      if (!(scale > 0)) throw Error("Missing timeline time scale");
      return {
        x: box.left + seconds * scale - scroll.scrollLeft,
        y: row.top + row.height / 2 + offsetY,
        scale,
      };
    },
    { surface, viewport, seconds, offsetY },
  );
}
export async function revision(page: Page) {
  return page.evaluate(() => window.musart!.snapshot().revision);
}
export async function authored(page: Page) {
  return page.evaluate(() => window.musart!.snapshot().project.pages[0]!.motion!.tracks);
}
export async function undo(page: Page) {
  await page.locator(".motion-ruler").focus();
  await page.keyboard.press("Control+z");
}
export async function paints(page: Page) {
  return Number(await page.locator(surface).getAttribute("data-timeline-paints"));
}

export async function firstScrollFrame(page: Page, dx: number, dy: number) {
  const armed = await page.locator(viewport).evaluateHandle((node, surface) => {
    let cancel: () => void = () => undefined;
    const capture = new Promise<{
      top: number;
      left: number;
      paintedTop: number;
      paintedLeft: number;
      first: number;
      last: number;
      height: number;
      rows: number;
      items: number;
      labels: number[];
    }>((resolve, reject) => {
      let frame = 0;
      const timer = setTimeout(() => {
        node.removeEventListener("scroll", scroll);
        reject(Error("Native scroll did not arrive"));
      }, 3500);
      cancel = () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        node.removeEventListener("scroll", scroll);
      };
      function scroll() {
        node.removeEventListener("scroll", scroll);
        frame = requestAnimationFrame(() => {
          clearTimeout(timer);
          const data = document.querySelector<HTMLCanvasElement>(surface)!.dataset;
          resolve({
            top: node.scrollTop,
            left: node.scrollLeft,
            paintedTop: Number(data.timelineTop),
            paintedLeft: Number(data.timelineLeft),
            first: Number(data.timelineFirstRow),
            last: Number(data.timelineLastRow),
            height: Number(data.timelineHeight),
            rows: Number(data.timelineRows),
            items: Number(data.timelineItems),
            labels: [
              ...document.querySelectorAll<HTMLElement>(".motion-row[data-labels-only=true]"),
            ].map((row) => parseFloat(row.style.top) / 24),
          });
        });
      }
      node.addEventListener("scroll", scroll, { passive: true });
    });
    void capture.catch(() => undefined);
    return { capture, cancel: () => cancel() };
  }, surface);
  try {
    await page.mouse.wheel(dx, dy);
    return await armed.evaluate((state) => state.capture);
  } finally {
    await armed.evaluate((state) => state.cancel());
    await armed.dispose();
  }
}

/** Decode the delivered native screenshot outside the instrumented production page. */
export async function rowPixels(browser: Browser, png: Buffer, top: number, height: number) {
  const inspector = await browser.newPage();
  try {
    return await inspector.evaluate(
      async ({ url, top, height }) => {
        if (window.__musartVideoReadbacks)
          throw Error("Screenshot inspector has a production probe");
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        const ratio = image.height / height,
          contrasts: number[] = [];
        for (let row = Math.ceil(top / 24); (row + 1) * 24 - top < height; row++) {
          const x = Math.floor(image.width * 0.4),
            y = row * 24 - top;
          const a = (Math.floor((y + 12) * ratio) * image.width + x) * 4;
          const b = (Math.floor((y + 1) * ratio) * image.width + x) * 4;
          contrasts.push(
            Math.max(
              ...[0, 1, 2].map((channel) => Math.abs(pixels[a + channel]! - pixels[b + channel]!)),
            ),
          );
        }
        return contrasts;
      },
      { url: `data:image/png;base64,${png.toString("base64")}`, top, height },
    );
  } finally {
    await inspector.close();
  }
}
