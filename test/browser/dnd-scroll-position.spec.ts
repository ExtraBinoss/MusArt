import { expect, test, type Page } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";
import { createLayer, createPage, createProject } from "@musart/core";

async function load(page: Page) {
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const layers = Array.from({ length: 120 }, (_, index) =>
    createLayer("rectangle", {
      id: `scroll-${index}`,
      name: `Scroll ${index}`,
      visible: false,
    }),
  );
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["scroll-119"]);
    },
    createProject({
      pages: [
        createPage({
          layers,
          motion: {
            version: 1,
            initialized: true,
            mode: "motion",
            duration: { value: 30, rate: 1 },
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
    }),
  );
}
async function pinTimeline(page: Page) {
  const pin = page.getByRole("button", { name: "Épingler la timeline", exact: true });
  await pin.evaluate((node) => node.focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
  await expect(page.locator(".motion-timeline-dock")).toHaveAttribute("data-motion-pinned", "true");
  const mode = page.getByRole("button", { name: "Keyframes", exact: true });
  if (await mode.count()) await mode.click();
  await expect(page.locator("canvas[data-timeline-canvas=true]")).toBeVisible();
}
async function rows(page: Page, selector: string) {
  return page.locator(selector).evaluate((viewport) => {
    const box = viewport.getBoundingClientRect();
    return [...viewport.querySelectorAll<HTMLElement>('[data-layer-drop-kind="layer"]')]
      .filter((row) => !row.hasAttribute("data-timeline-drop-target"))
      .map((row) => ({
        id: row.dataset.layerDropId!,
        x: row.getBoundingClientRect().x,
        y: row.getBoundingClientRect().y,
        height: row.getBoundingClientRect().height,
      }))
      .filter((row) => row.y > box.top + 35 && row.y + row.height < box.bottom - 25);
  });
}
async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
for (const surface of ["layers", "timeline"] as const) {
  test(`${surface} reorder preserves a scrolled viewport and does not reveal an unchanged selection`, async ({
    page,
  }) => {
    await load(page);
    if (surface === "timeline") await pinTimeline(page);
    const selector = surface === "layers" ? ".layer-tree" : ".motion-timeline-scroll";
    const viewport = page.locator(selector);
    await viewport.hover();
    await page.mouse.wheel(0, 900);
    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(300);
    await frames(page);
    const top = await viewport.evaluate((node) => node.scrollTop);
    const visible = await rows(page, selector);
    const a = visible[4]!,
      b = visible[2]!;
    await page.mouse.move(a.x + 110, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 120, a.y + a.height / 2, { steps: 3 });
    await page.mouse.move(b.x + 110, b.y + 2, { steps: 8 });
    await page.mouse.move(b.x + 111, b.y + 2);
    await expect(page.locator(".layer-drop-cue:visible")).toHaveCount(1);
    await page.mouse.up();
    await frames(page);
    expect(await viewport.evaluate((node) => node.scrollTop)).toBeCloseTo(top, 0);
    await expect(page.locator(".dnd-placement-halo")).toHaveCount(1);
  });
}
test("canvas time dragging never focuses the scroll viewport back to its origin", async ({
  page,
}) => {
  await load(page);
  await pinTimeline(page);
  const viewport = page.locator(".motion-timeline-scroll");
  await viewport.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(300);
  await frames(page);
  const top = await viewport.evaluate((node) => node.scrollTop);
  const visible = await rows(page, ".motion-timeline-scroll");
  const a = visible[1]!;
  const canvas = (await page.locator("canvas[data-timeline-canvas=true]").boundingBox())!;
  await page.mouse.move(canvas.x + 80, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 140, a.y + 11, { steps: 8 });
  await page.mouse.up();
  await frames(page);
  expect(await viewport.evaluate((node) => node.scrollTop)).toBeCloseTo(top, 0);
});

test("a virtual timeline motion control opens its real editor and returns keyboard focus", async ({
  page,
}) => {
  await load(page);
  await pinTimeline(page);
  const button = page
    .locator(".motion-row[data-labels-only=true] .motion-transition-trigger")
    .first();
  await button.hover();
  await button.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button).toBeFocused();
});

test("cached real audio envelopes remain painted while rapidly scrolling the timeline", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.getByRole("button", { name: "Menu du projet", exact: true }).click();
  await page
    .locator(".library-navigation")
    .getByRole("button", { name: "Templates", exact: true })
    .click();
  await page.getByRole("button", { name: /Sound Playground/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await pinTimeline(page);
  const viewport = page.locator(".motion-timeline-scroll");
  const canvas = page.locator("canvas[data-timeline-canvas=true]");
  await viewport.hover();
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-timeline-waveforms")))
    .toBeGreaterThan(0);
  await page.mouse.wheel(0, -120);
  await page.mouse.wheel(0, 120);
  await frames(page);
  expect(Number(await canvas.getAttribute("data-timeline-waveforms"))).toBeGreaterThan(0);
  const track = await viewport.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return [
      ...node.querySelectorAll<HTMLElement>("[data-audio-track-id][data-labels-only=true]"),
    ].find((row) => {
      const r = row.getBoundingClientRect();
      return r.top > box.top + 40 && r.bottom < box.bottom - 25;
    })?.dataset.audioTrackId;
  });
  expect(track).toBeTruthy();
  const gain = viewport.locator(
    `[data-audio-track-id="${track}"][data-labels-only=true] .motion-audio-gain`,
  );
  await gain.click();
  await expect(
    page.locator(".motion-audio-volume").getByRole("slider", { name: "Volume" }),
  ).toBeVisible();
  await gain.click();
  await expect(page.locator(".motion-audio-volume")).toHaveCount(0);
  await expect(gain).toBeFocused();
  await page.screenshot({ path: "artifacts/motion/perf/scroll-205418/audio-backscroll.png" });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
    gpuHook: true,
    canvasHook: true,
  });
});

test("toolbar reorder preserves its native scroll offset with twelve pins in a short viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "musart.dock.commands",
      JSON.stringify([
        "action:addPage",
        "action:addTechnoArtboard",
        "action:save",
        "action:exportImage",
        "action:importImages",
        "action:toolPointer",
        "action:toolHand",
        "action:toolText",
        "action:toolRectangle",
        "action:toolEllipse",
        "action:recenter",
        "action:fit",
      ]),
    ),
  );
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const viewport = page.locator("[data-dock-scroll]");
  await viewport.hover();
  await page.mouse.wheel(0, 450);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(200);
  const top = await viewport.evaluate((node) => node.scrollTop);
  const visible = await viewport.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return [...node.querySelectorAll<HTMLElement>("[data-dock-command]")]
      .map((row) => ({ id: row.dataset.dockCommand!, ...row.getBoundingClientRect().toJSON() }))
      .filter((row) => row.y > box.top + 30 && row.bottom < box.bottom - 30);
  });
  const a = visible[2]!,
    b = visible[0]!;
  await page.mouse.move(a.x + 16, a.y + 16);
  await page.mouse.down();
  await page.mouse.move(a.x + 22, a.y + 16, { steps: 3 });
  await page.mouse.move(b.x + 16, b.y + 3, { steps: 8 });
  await page.mouse.move(b.x + 17, b.y + 3);
  await expect(page.locator("[data-dock-drop-position]")).toHaveCount(1);
  await page.mouse.up();
  await frames(page);
  expect(await viewport.evaluate((node) => node.scrollTop)).toBeCloseTo(top, 0);
});
