import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
const fixture = (empty = false) => {
  const layers = empty
    ? []
    : [
        createLayer("rectangle", {
          id: "motion-card",
          name: "Motion card",
          x: 80,
          y: 80,
          width: 360,
          height: 240,
          radius: 24,
          fill: "#78955F",
        }),
      ];
  return createProject({
    pages: [
      createPage({
        id: "motion-ui",
        name: "Motion interface",
        width: 960,
        height: 640,
        background: "#17231C",
        layers,
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 5, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: layers.map((layer) => ({
            id: "card-track",
            layerId: layer.id,
            start: { value: 0, rate: 1 },
            end: null,
            properties: [
              {
                id: "card-position",
                target: { kind: "layer", layerId: layer.id, property: "x" },
                keyframes: [
                  { id: "card-start", time: { value: 0, rate: 1 }, value: 80 },
                  {
                    id: "card-end",
                    time: { value: 5, rate: 1 },
                    value: 480,
                    easing: { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
                  },
                ],
              },
            ],
          })),
        },
      }),
    ],
  });
};

async function commits(page: Page) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => [
          selector,
          Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
        ]),
      ),
    roots,
  );
}
async function load(page: Page, empty = false) {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.theme", "dark"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), fixture(empty));
  await expect(page.locator(".motion-timeline-dock")).toHaveCSS("opacity", "1");
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
}

test("dark Motion ruler stays clipped, follows playback at high zoom, and keeps canvas roots quiet", async ({
  page,
}) => {
  await load(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ruler = page.locator(".motion-ruler"),
    scroll = page.locator(".motion-timeline-scroll");
  const zoom = page.getByRole("slider", { name: "Zoom de la timeline", exact: true });
  await zoom.focus();
  await page.keyboard.press("End");
  await expect(zoom).toHaveAttribute("aria-valuenow", "640");
  await ruler.focus();
  await page.keyboard.press("Home");
  const before = await commits(page);
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(100);
  await expect.poll(() => ruler.getAttribute("aria-valuenow")).not.toBe("0");
  const following = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(".motion-timeline-scroll")!;
    const head = document.querySelector<HTMLElement>(".motion-ruler-playhead")!;
    const gutter = document.querySelector<HTMLElement>(".motion-ruler-label")!;
    const clip = document.querySelector<HTMLElement>(".motion-playhead-clip")!;
    const line = document.querySelector<HTMLElement>(".motion-playhead")!;
    const a = head.getBoundingClientRect(),
      b = gutter.getBoundingClientRect();
    const c = clip.getBoundingClientRect(),
      d = line.getBoundingClientRect();
    return {
      left: viewport.scrollLeft,
      head: a.x + a.width / 2,
      gutterEnd: b.right,
      line: d.x,
      clipStart: c.x,
      clipEnd: c.right,
      headColor: getComputedStyle(head).color,
      primary: getComputedStyle(head).getPropertyValue("--primary").trim(),
    };
  });
  expect(following.head).toBeGreaterThanOrEqual(following.gutterEnd);
  expect(following.head).toBeLessThan(following.clipEnd);
  expect(Math.abs(following.line - following.head)).toBeLessThan(3);
  expect(following.clipStart).toBeCloseTo(following.gutterEnd, 0);
  await page.screenshot({ path: "artifacts/motion/ui/follow-high-zoom.png" });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(await commits(page)).toEqual(before);

  // Actual pointer click must not leave a keyboard focus stripe under the ruler.
  const bounds = (await scroll.boundingBox())!;
  await page.mouse.click(bounds.x + 310, bounds.y + 16);
  expect(await ruler.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
  await ruler.focus();
  await page.keyboard.press("End");
  expect(await ruler.evaluate((node) => getComputedStyle(node).boxShadow)).toBe("none");
  await expect(page.locator(".motion-ruler-playhead")).toHaveAttribute("data-at-end", "true");
  const marker = page.locator(".motion-end-marker");
  await marker.scrollIntoViewIfNeeded();
  await marker.hover();
  await expect(page.getByRole("tooltip")).toContainText("Fin de la composition");
  await page.screenshot({ path: "artifacts/motion/ui/end-marker.png" });
  await page.mouse.move(10, 10);

  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBe(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const scrollBounds = (await scroll.boundingBox())!;
  await page.mouse.move(scrollBounds.x + 550, scrollBounds.y + 65);
  await page.mouse.wheel(240, 0);
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(100);

  // Height changes are imperative while dragging; the line follows the available body.
  const panel = page.locator(".motion-timeline"),
    grip = page.getByRole("separator", { name: "Redimensionner la timeline" });
  const initial = (await panel.boundingBox())!,
    handle = (await grip.boundingBox())!;
  await page.mouse.move(handle.x + 500, handle.y + 3);
  await page.mouse.down();
  await page.mouse.move(handle.x + 500, handle.y - 90, { steps: 8 });
  await page.mouse.up();
  expect((await panel.boundingBox())!.height).toBeGreaterThan(initial.height + 70);
  const clipHeight = await page
    .locator(".motion-playhead-clip")
    .evaluate((node) => node.getBoundingClientRect().height);
  expect(clipHeight).toBeGreaterThan(initial.height - 40);

  const beforeToggle = await commits(page);
  await page.getByRole("button", { name: "Fermer la timeline", exact: true }).click();
  await expect(page.locator(".motion-timeline-dock")).toBeHidden();
  await expect(page.locator(".canvas-timeline-toggle")).toBeFocused();
  await page.locator(".canvas-timeline-toggle").click();
  await expect(page.locator(".motion-timeline-dock")).toHaveCSS("opacity", "1");
  expect(await commits(page)).toEqual(beforeToggle);
  expect(errors).toEqual([]);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await mkdir("artifacts/motion/ui", { recursive: true });
  await writeFile(
    "artifacts/motion/ui/interaction-report.json",
    JSON.stringify({ following, reads, errors }, null, 2),
  );
});

test("empty timeline and artboard controls remain legible at compact viewports and low canvas zoom", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 960, height: 720 });
  await load(page, true);
  await expect(page.getByText("Vos calques apparaîtront ici.")).toBeVisible();
  const ruler = page.locator(".motion-ruler");
  await ruler.click({ position: { x: 15, y: 12 } });
  const initial = await page.evaluate(() => {
    const head = document.querySelector(".motion-ruler-playhead")!.getBoundingClientRect();
    const gutter = document.querySelector(".motion-ruler-label")!.getBoundingClientRect();
    return {
      head: head.x + head.width / 2,
      end: gutter.right,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(initial.head).toBeGreaterThanOrEqual(initial.end);
  expect(initial.overflow).toBe(false);
  await expect(ruler).toHaveCSS("outline-style", "none");
  await expect(ruler).toHaveCSS("box-shadow", "none");
  const panel = page.getByRole("region", { name: "Timeline", exact: true });
  const before = await commits(page);
  await page.getByRole("button", { name: "Fermer la timeline", exact: true }).click();
  await expect(panel).toBeHidden();
  await page.locator(".canvas-timeline-toggle").click();
  await expect(panel).toBeVisible();
  await expect(page.locator(".motion-timeline-dock")).toHaveCSS("opacity", "1");
  expect(await commits(page)).toEqual(before);
  await page.getByRole("radio", { name: "Statique", exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole("radio", { name: "Motion", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(page.locator(".motion-timeline-dock")).toHaveCSS("opacity", "1");
  const canvas = (await page.locator(".editor-canvas").boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.keyboard.down("Control");
  for (let step = 0; step < 8; step++) await page.mouse.wheel(0, 180);
  await page.keyboard.up("Control");
  await expect(page.locator(".artboard-mode-footer")).toHaveAttribute("data-compact", "true");
  await expect(page.getByRole("radio", { name: "Statique", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Motion", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  await page.screenshot({ path: "artifacts/motion/ui/empty-compact-reduced-dark.png" });
});

test("timeline focus keeps native Undo/Redo routing and text-field ownership", async ({ page }) => {
  await load(page);
  await page.evaluate(() =>
    window.musart!.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "motion-card", property: "x" },
      time: { value: 5, rate: 1 },
      value: 700,
    }),
  );
  const endValue = () =>
    page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes.at(-1)!.value,
    );
  expect(await endValue()).toBe(700);
  const ruler = page.getByRole("slider", { name: "Se déplacer dans la timeline" });
  await ruler.focus();
  await page.keyboard.press("Control+z");
  await expect.poll(endValue).toBe(480);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(endValue).toBe(700);
  await page.getByRole("spinbutton", { name: "Temps actuel" }).focus();
  await page.keyboard.press("Control+z");
  expect(await endValue()).toBe(700);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
});

test("shared scroll shadows and visible rows stay bounded in a 500-layer timeline", async ({
  page,
}) => {
  await load(page);
  const layers = Array.from({ length: 500 }, (_, index) =>
    createLayer("rectangle", {
      id: `virtual-${index}`,
      name: `Virtual layer ${index}`,
      width: 20,
      height: 20,
      x: (index % 40) * 23,
      y: Math.floor(index / 40) * 23,
    }),
  );
  const project = fixture();
  project.pages[0]!.layers = layers;
  project.pages[0]!.motion!.tracks = layers.map((layer) => ({
    id: `track-${layer.id}`,
    layerId: layer.id,
    start: { value: 0, rate: 1 },
    end: null,
    properties: [],
  }));
  await page.evaluate((project) => window.musart!.load(project), project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  const scroll = page.locator(".motion-timeline-scroll"),
    shadow = page.locator(".motion-scroll-shadow");
  await expect(shadow).toHaveAttribute("data-overflow-bottom", "");
  expect(await page.locator(".motion-row").count()).toBeGreaterThan(5);
  expect(await page.locator(".motion-row").count()).toBeLessThan(35);
  const before = await commits(page);
  const names = await page.locator(".motion-row-name").allTextContents();
  const bounds = (await scroll.boundingBox())!;
  await page.mouse.move(bounds.x + 150, bounds.y + 120);
  await page.mouse.wheel(0, 800);
  await expect(shadow).toHaveAttribute("data-overflow-top", "");
  await expect.poll(() => page.locator(".motion-row-name").allTextContents()).not.toEqual(names);
  expect(await page.locator(".motion-row").count()).toBeLessThan(35);
  expect(await commits(page)).toEqual(before);
  await page.screenshot({ path: "artifacts/motion/ui/virtualized-scroll-dark.png" });
});
