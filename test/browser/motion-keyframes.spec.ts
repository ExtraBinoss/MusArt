import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
async function load(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.theme", "dark"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layer = createLayer("rectangle", {
    id: "card",
    name: "Motion card",
    width: 220,
    height: 120,
    x: 80,
    y: 60,
    fill: "#8B5CF6",
  });
  const text = createLayer("text", {
    id: "text",
    name: "Gradient title",
    text: "MUSART",
    width: 600,
    height: 120,
    fontSize: 80,
    x: 80,
    y: 300,
    fillGradient: {
      kind: "linear",
      angle: 135,
      stops: [
        { offset: 0, color: "#6C3BFF" },
        { offset: 0.34, color: "#FF4F9B" },
        { offset: 0.67, color: "#FF9B54" },
        { offset: 1, color: "#3B82F6" },
      ],
    },
  });
  const project = createProject({
    pages: [
      createPage({
        id: "page",
        width: 960,
        height: 640,
        layers: [layer, text],
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 3, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "card-track",
              layerId: "card",
              start: { value: 0, rate: 1 },
              end: null,
              properties: [
                {
                  id: "card-x",
                  target: { kind: "layer", layerId: "card", property: "x" },
                  keyframes: [
                    { id: "start", time: { value: 0, rate: 1 }, value: 80 },
                    { id: "end", time: { value: 2, rate: 1 }, value: 480 },
                  ],
                },
              ],
            },
            {
              id: "text-track",
              layerId: "text",
              start: { value: 0, rate: 1 },
              end: null,
              properties: [],
            },
          ],
        },
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["card"]);
  }, project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
  await expect(page.locator(".motion-timeline-dock")).toHaveAttribute("data-motion-pinned", "true");
}
async function counts(page: Page) {
  return page.evaluate(
    (selectors) =>
      selectors.map((selector) =>
        Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
      ),
    roots,
  );
}

test("keyframe hover waits 500ms and dragging previews the composition before one undoable commit", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("spinbutton", { name: "Temps actuel", exact: true }).fill("1000");
  await page.keyboard.press("Enter");
  const selection = page.locator('.canvas-selection[data-layer-id="card"]');
  const x = () => selection.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).e);
  await expect.poll(x).toBeCloseTo(280, 2);
  const key = page.locator('.motion-key[data-key-id="end"]');
  await key.hover();
  await page.waitForTimeout(250);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("tooltip")).toHaveText("Position X · 2000 ms");
  const revision = await page.evaluate(() => window.musart!.snapshot().revision),
    bounds = (await key.boundingBox())!;
  const connector = page.locator("button.motion-easing-segment");
  const connectorWidth = await connector.evaluate((node) =>
    parseFloat((node as HTMLElement).style.width),
  );
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(key).toHaveAttribute("aria-pressed", "true");
  const before = await counts(page);
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2, {
    steps: 3,
  });
  await expect.poll(x).toBeCloseTo(240, 2);
  await expect(page.locator(".motion-gesture-feedback")).toHaveText("2.500 s");
  await expect(page.getByRole("tooltip")).toHaveText("Position X · 2500 ms");
  await expect(
    page.getByRole("spinbutton", { name: "Temps de l’image clé", exact: true }),
  ).toHaveValue("2500");
  const liveConnector = page.locator('[data-motion-link-preview="end"]');
  await expect(liveConnector).toHaveCSS("width", `${connectorWidth + 60}px`);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision);
  expect(await counts(page)).toEqual(before);
  await mkdir("artifacts/motion/ui", { recursive: true });
  await page.screenshot({ path: "artifacts/motion/ui/keyframe-live-drag.png" });
  await page.mouse.up();
  await expect(liveConnector).toHaveCount(0);
  await expect(connector).toHaveCSS("width", `${connectorWidth + 60}px`);
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(revision + 1);
  await expect.poll(x).toBeCloseTo(240, 2);
  await page.evaluate(() => window.musart!.undo());
  await expect.poll(x).toBeCloseTo(280, 2);
  await expect(connector).toHaveCSS("width", `${connectorWidth}px`);
  await key.hover();
  const origin = (await key.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(origin.x + origin.width / 2 + 60, origin.y + origin.height / 2);
  await expect.poll(x).toBeCloseTo(240, 2);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(x).toBeCloseTo(280, 2);
  await expect(liveConnector).toHaveCount(0);
  await expect(connector).toHaveCSS("width", `${connectorWidth}px`);
  const hovered = page.locator('.canvas-timeline-hover[data-layer-id="text"]');
  const hoverRevision = await page.evaluate(() => window.musart!.snapshot().revision);
  const beforeHover = await counts(page);
  await page
    .getByRole("button", { name: "Intervalle actif de Gradient title", exact: true })
    .hover();
  await expect(hovered).toBeVisible();
  await expect(hovered.locator(".canvas-timeline-hover-handle")).toHaveCount(4);
  expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual(["card"]);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(hoverRevision);
  expect(await counts(page)).toEqual(beforeHover);
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await page
    .getByRole("button", { name: "Intervalle actif de Gradient title", exact: true })
    .hover();
  await expect(hovered).toHaveCSS("opacity", "0.2");
  await expect(selection).toHaveCSS("opacity", "0.2");
  await expect(selection.locator(".canvas-handle").first()).toBeDisabled();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(selection).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
});

test("gradient controls remain compact in both themes and real stop drags commit once", async ({
  page,
}) => {
  await load(page);
  await page.evaluate(() => window.musart!.select(["text"]));
  await expect(page.getByRole("radio", { name: "Dégradé", exact: true })).toBeChecked();
  const stop = page.getByRole("slider", { name: "Point 2", exact: true });
  const before = await page.evaluate(() => window.musart!.snapshot().revision),
    point = (await stop.boundingBox())!,
    ramp = (await page.locator("[data-gradient-ramp]").boundingBox())!;
  await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
  await page.mouse.down();
  await page.mouse.move(ramp.x + ramp.width * 0.5, point.y + point.height / 2, { steps: 3 });
  await expect
    .poll(async () => Number(await stop.getAttribute("aria-valuenow")))
    .toBeCloseTo(50, 0);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before);
  await page.mouse.up();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before + 1);
  const position = () =>
    page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[1]!.fillGradient!.stops[1]!.offset,
    );
  expect(await position()).toBeCloseTo(0.5, 2);
  await mkdir("artifacts/motion/ui", { recursive: true });
  await page.screenshot({ path: "artifacts/motion/ui/gradient-picker-dark.png" });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 960, height: 800 });
  const hex = page.getByRole("textbox", { name: "Couleur hexadécimale du point 2" });
  await expect(hex).toBeVisible();
  const geometry = await hex.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: innerWidth };
  });
  expect(geometry.left).toBeGreaterThan(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  await page.screenshot({ path: "artifacts/motion/ui/gradient-picker-light-narrow.png" });
  await page.evaluate(() => window.musart!.undo());
  expect(await position()).toBe(0.34);
});

test("keyframes remain neutral until selected and have readable contrast in both themes", async ({
  page,
}) => {
  await load(page);
  const selected = page.locator('.motion-key[data-key-id="end"]');
  await selected.click();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".motion-zoom")).toHaveAttribute("data-tone", "primary");
  const opacity = page.getByRole("textbox", { name: "Opacité", exact: true });
  await expect(opacity).toHaveValue("100");
  expect(
    await opacity.evaluate((node) => {
      const style = getComputedStyle(node);
      return (
        node.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    }),
  ).toBeGreaterThanOrEqual(34);
  const samples = [];
  await mkdir("artifacts/motion/ui", { recursive: true });
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    );
    const sample = await page.evaluate(() => {
      function color(raw: string): number[] {
        if (raw.startsWith("#"))
          return [1, 3, 5].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255).concat(1);
        const parts = raw.match(/[\d.]+/g)!.map(Number),
          scale = raw.startsWith("color(srgb") ? 1 : 255;
        return parts
          .slice(0, 3)
          .map((v) => v / scale)
          .concat(parts[3] ?? 1);
      }
      function over(fg: number[], bg: number[]) {
        return fg.slice(0, 3).map((v, i) => v * fg[3]! + bg[i]! * (1 - fg[3]!));
      }
      function luminance(rgb: number[]) {
        return rgb
          .slice(0, 3)
          .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
          .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
      }
      function contrast(a: number[], b: number[]) {
        const x = luminance(a),
          y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      }
      const key = document.querySelector('.motion-key[data-key-id="end"]')!,
        idle = document.querySelector('.motion-key[data-key-id="start"]')!,
        row = key.closest(".motion-row")!,
        root = getComputedStyle(document.documentElement),
        bg = over(
          color(getComputedStyle(row).backgroundColor),
          color(root.getPropertyValue("--background").trim()),
        ),
        keyColor = color(getComputedStyle(key.querySelector("svg")!).stroke),
        idleColor = color(getComputedStyle(idle.querySelector("svg")!).stroke),
        lineStyle = getComputedStyle(document.querySelector(".motion-easing-segment")!, "::before"),
        line = color(lineStyle.backgroundColor);
      const zoom = document.querySelector(".motion-zoom")!;
      const range = zoom.querySelector('[data-slot="slider-range"]')!;
      const probe = document.createElement("span");
      probe.style.color = "var(--primary)";
      zoom.append(probe);
      const primary = color(getComputedStyle(probe).color);
      probe.remove();
      line[3] = line[3]! * Number(lineStyle.opacity);
      return {
        background: bg,
        selected: contrast(keyColor, bg),
        idle: contrast(idleColor, bg),
        line: contrast(over(line, bg), bg),
        idleColor: idleColor.slice(0, 3),
        neutral: color(root.getPropertyValue("--muted-foreground").trim()).slice(0, 3),
        selectedColor: keyColor.slice(0, 3),
        zoomRange: color(getComputedStyle(range).backgroundColor),
        primary,
      };
    });
    samples.push({ theme, ...sample });
    await writeFile("artifacts/motion/ui/keyframe-contrast.json", JSON.stringify(samples, null, 2));
    await page.screenshot({ path: `artifacts/motion/ui/keyframe-contrast-${theme}.png` });
    expect(sample.selected).toBeGreaterThanOrEqual(3);
    expect(sample.idle).toBeGreaterThanOrEqual(3);
    expect(sample.line).toBeGreaterThanOrEqual(3);
    expect(sample.idleColor).toEqual(sample.neutral);
    expect(sample.selectedColor[2]!).toBeGreaterThan(sample.selectedColor[0]!);
    expect(sample.zoomRange).toEqual(sample.primary);
  }
  await writeFile("artifacts/motion/ui/keyframe-contrast.json", JSON.stringify(samples, null, 2));
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
});
