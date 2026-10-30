import { expect, test, type Page } from "@playwright/test";
import {
  addMotionTime,
  createLayer,
  createPage,
  createProject,
  motionTimeToSeconds,
  subtractMotionTime,
} from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

const artifact = "artifacts/motion/occurrences-native";
const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
const time = (value: number, rate = 1) => ({ value, rate });
function fixture() {
  const shape = createLayer("rectangle", {
    id: "occurrence-card",
    name: "Occurrence card",
    x: 80,
    y: 110,
    width: 220,
    height: 140,
    radius: 18,
    fill: "#9775D8",
  });
  return createProject({
    id: "native-occurrences",
    name: "Independent occurrences",
    pages: [
      createPage({
        id: "occurrence-page",
        width: 800,
        height: 500,
        background: "#1D2024",
        layers: [shape],
        motion: {
          version: 2,
          initialized: true,
          mode: "motion",
          duration: time(6),
          frameRate: { numerator: 30000, denominator: 1001 },
          tracks: [
            {
              id: "occurrence-a",
              layerId: shape.id,
              start: time(0),
              end: time(2),
              properties: [
                {
                  id: "a-x",
                  target: { kind: "layer", layerId: shape.id, property: "x" },
                  keyframes: [
                    { id: "a-start", time: time(0), value: 80 },
                    { id: "a-end", time: time(2), value: 160 },
                  ],
                },
              ],
            },
            {
              id: "occurrence-b",
              layerId: shape.id,
              start: time(4),
              end: time(6),
              properties: [
                {
                  id: "b-x",
                  target: { kind: "layer", layerId: shape.id, property: "x" },
                  keyframes: [
                    { id: "b-start", time: time(4), value: 320 },
                    { id: "b-end", time: time(6), value: 400 },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ],
  });
}
async function seek(page: Page, milliseconds: string) {
  const input = page.getByRole("spinbutton", { name: "Temps actuel", exact: true });
  await input.fill(milliseconds);
  await input.press("Enter");
  await expect(page.locator(".motion-ruler")).toHaveAttribute(
    "aria-valuenow",
    String(Number(milliseconds) / 1000),
  );
}
async function undo(page: Page) {
  await page.locator(".motion-ruler").focus();
  await page.keyboard.press("Control+z");
}
async function counters(page: Page) {
  return page.evaluate(
    (selectors) =>
      selectors.map((selector) =>
        Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
      ),
    roots,
  );
}

/** Functional browser proof only. No tracing, profiler, repeated Play loop or stress workload. */
test("one visual layer owns independent clips, property keys, a gap copy and one-step undo", async ({
  page,
  browser,
}) => {
  test.setTimeout(40_000);
  await mkdir(artifact, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  try {
    await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate((project) => {
      window.musart!.load(project);
      window.musart!.select(["occurrence-card"]);
    }, fixture());
    const dock = page.locator(".motion-timeline-dock");
    await expect(dock).toBeVisible();
    const pin = page.getByRole("button", { name: "Épingler la timeline", exact: true });
    if (await pin.isVisible()) await pin.click();
    await expect(dock).toHaveAttribute("data-motion-pinned", "true");
    await expect(dock).not.toHaveAttribute("data-motion-animating");
    await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
      timeout: 12_000,
    });
    const row = page.locator('.motion-row:not(.is-property)[data-layer-id="occurrence-card"]');
    await expect(row).toHaveCount(1);
    await expect(row.locator(".motion-track-wrap")).toHaveCount(2);
    await expect(
      page.locator('.layers-panel .layer-row[data-layer-id="occurrence-card"]'),
    ).toHaveCount(1);

    // Real clip selection changes the property scope rather than creating another visual layer.
    const second = row.locator('[data-track-id="occurrence-b"] .motion-track');
    await second.click();
    await expect(page.getByRole("spinbutton", { name: "Temps actuel", exact: true })).toHaveValue(
      "4000",
    );
    const x = page.locator(".inspector").getByRole("textbox", { name: "X", exact: true });
    await expect(x).toHaveValue("320");
    await expect(page.locator('.motion-row-time[data-motion-property-id="b-x"]')).toHaveCount(1);
    await expect(page.locator('.motion-row-time[data-motion-property-id="a-x"]')).toHaveCount(0);
    const beforeEdit = await page.evaluate(() => window.musart!.snapshot());
    await x.fill("350");
    await x.press("Enter");
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
      .toBe(beforeEdit.revision + 1);
    const edited = await page.evaluate(() => window.musart!.snapshot());
    expect(edited.project.pages[0]!.layers).toHaveLength(1);
    expect(edited.project.pages[0]!.layers[0]!.x).toBe(80);
    expect(
      edited.project.pages[0]!.motion!.tracks.find((track) => track.id === "occurrence-a")!
        .properties[0]!.keyframes[0]!.value,
    ).toBe(80);
    expect(
      edited.project.pages[0]!.motion!.tracks.find((track) => track.id === "occurrence-b")!
        .properties[0]!.keyframes[0]!.value,
    ).toBe(350);
    await page.screenshot({ path: `${artifact}/selected-occurrence.png` });

    // Hovering an actual gap paints one ghost without React parent commits or canonical edits.
    await seek(page, "2500");
    await expect(x).toBeDisabled();
    const beforeCopy = await page.evaluate(() => window.musart!.snapshot());
    const quiet = await counters(page);
    expect(quiet.every(Number.isFinite)).toBe(true);
    const surface = row.locator(".motion-occurrence-surface");
    const rectangle = (await surface.boundingBox())!;
    const scale = Number(
      await page
        .getByRole("slider", { name: "Zoom de la timeline", exact: true })
        .getAttribute("aria-valuenow"),
    );
    await page.mouse.move(rectangle.x + 2.5 * scale, rectangle.y + rectangle.height / 2);
    const ghost = row.locator(".motion-gap-add");
    await expect(ghost).toBeVisible();
    expect(await counters(page)).toEqual(quiet);
    expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(beforeCopy.revision);
    await ghost.click();
    await expect(row.locator(".motion-track-wrap")).toHaveCount(3);
    const copied = await page.evaluate(() => window.musart!.snapshot());
    expect(copied.revision).toBe(beforeCopy.revision + 1);
    expect(copied.project.pages[0]!.layers).toEqual(beforeCopy.project.pages[0]!.layers);
    const addition = copied.project.pages[0]!.motion!.tracks.find(
      (track) => !["occurrence-a", "occurrence-b"].includes(track.id),
    )!;
    expect(addition.layerId).toBe("occurrence-card");
    expect(Math.abs(motionTimeToSeconds(addition.start) - 2.5)).toBeLessThan(1 / scale);
    expect(addition.end).toEqual(time(4));
    const source = beforeCopy.project.pages[0]!.motion!.tracks.find(
      (track) => track.id === "occurrence-b",
    )!;
    const delta = subtractMotionTime(addition.start, source.start);
    expect(addition.properties[0]!.keyframes.map((key) => key.time)).toEqual(
      source.properties[0]!.keyframes.map((key) => addMotionTime(key.time, delta)),
    );
    const ids = new Set(
      beforeCopy.project.pages[0]!.motion!.tracks.flatMap((track) => [
        track.id,
        ...track.properties.flatMap((property) => [
          property.id,
          ...property.keyframes.map((key) => key.id),
        ]),
      ]),
    );
    expect(
      [
        addition.id,
        ...addition.properties.flatMap((property) => [
          property.id,
          ...property.keyframes.map((key) => key.id),
        ]),
      ].every((id) => !ids.has(id)),
    ).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw =
            document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset
              .presentedMotionTime;
          return raw ? (JSON.parse(raw) as { value: number; rate: number }) : null;
        }),
      )
      .toEqual(addition.start);
    await page.screenshot({ path: `${artifact}/gap-copy.png` });
    await undo(page);
    await expect(row.locator(".motion-track-wrap")).toHaveCount(2);
    expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(
      beforeCopy.project,
    );

    // Native double-click naming keeps one canonical name and leaves the occurrence records alone.
    const beforeRename = await page.evaluate(() => window.musart!.snapshot());
    await row.locator("button.motion-row-name").dblclick();
    const name = row.locator("input.motion-row-name-input");
    await name.fill("Occurrence renamed");
    await name.press("Enter");
    await expect(row.locator("button.motion-row-name")).toHaveText("Occurrence renamed");
    const renamed = await page.evaluate(() => window.musart!.snapshot());
    expect(renamed.revision).toBe(beforeRename.revision + 1);
    expect(renamed.project.pages[0]!.motion).toEqual(beforeRename.project.pages[0]!.motion);
    await undo(page);
    await expect(row.locator("button.motion-row-name")).toHaveText("Occurrence card");

    // Delete belongs to the focused key, never to the canonical artwork or a sibling occurrence.
    await second.click();
    const key = page.locator('.motion-key[data-key-id="b-end"]');
    await key.scrollIntoViewIfNeeded();
    await key.focus();
    const beforeDelete = await page.evaluate(() => window.musart!.snapshot());
    await page.keyboard.press("Delete");
    await expect(key).toHaveCount(0);
    const deleted = await page.evaluate(() => window.musart!.snapshot());
    expect(deleted.revision).toBe(beforeDelete.revision + 1);
    expect(deleted.project.pages[0]!.layers).toHaveLength(1);
    expect(
      deleted.project.pages[0]!.motion!.tracks.find((track) => track.id === "occurrence-a")!
        .properties[0]!.keyframes,
    ).toHaveLength(2);
    expect(
      deleted.project.pages[0]!.motion!.tracks.find(
        (track) => track.id === "occurrence-b",
      )!.properties[0]!.keyframes.map((key) => key.id),
    ).toEqual(["b-start"]);
    await undo(page);
    expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(
      beforeDelete.project,
    );
    const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
    expect(readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(errors).toEqual([]);
    await page.screenshot({ path: `${artifact}/restored.png` });
    await writeFile(
      `${artifact}/report.json`,
      JSON.stringify(
        {
          browser: browser.version(),
          errors,
          readbacks,
          quiet,
          canonicalLayers: copied.project.pages[0]!.layers.length,
          occurrences: copied.project.pages[0]!.motion!.tracks.length,
          copy: { start: addition.start, end: addition.end },
          rename: renamed.project.pages[0]!.layers[0]!.name,
          deletedKey: "b-end",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (!page.isClosed())
      await page.screenshot({ path: `${artifact}/failure.png`, timeout: 2000 }).catch(() => {});
    throw error;
  } finally {
    // Playwright owns the worker browser; explicitly close this owned page on every result.
    await page.close();
  }
});
