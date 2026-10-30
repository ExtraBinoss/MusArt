import { expect as baseExpect, test, type Page } from "@playwright/test";
import { motionTimeToSeconds } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { sfxWav, synthesizeSfx } from "../../apps/web/src/services/motion/audio/sfx";
import { installReadbackProbe } from "./support/readback-probe";
import { interactionEnvironment } from "./support/interaction-probe";
import { verifyCanvasReorder } from "./support/motion-canvas-drag";
import { verifyCanvasSpringPose } from "./support/motion-canvas-pose";
import {
  output,
  surface,
  fixture,
  frames,
  counters,
  prepare,
  prepareTemplate,
  point,
  revision,
  authored,
  undo,
  paints,
  firstScrollFrame,
  rowPixels,
} from "./support/motion-canvas";

const failures = new WeakMap<Page, string[]>();
const expect = baseExpect.configure({ timeout: 3500 });
const layerLabel = '.motion-row[data-layer-id="card"]:not(.is-property)';
const propertyLabel = '[data-motion-property-id="card-x"]';
test.use({ actionTimeout: 3500, navigationTimeout: 20_000 });

test.beforeEach(async ({ page }) => {
  test.setTimeout(40_000);
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  failures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.theme", "dark");
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
});
test.afterEach(async ({ page }, info) => {
  if (page.isClosed()) return;
  const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
  await writeFile(
    `${output}/${info.title.replace(/[^a-z0-9]+/gi, "-")}.json`,
    JSON.stringify(
      {
        status: info.status,
        errors: failures.get(page),
        readbacks,
        environment: await interactionEnvironment(page),
      },
      null,
      2,
    ),
  );
  expect(failures.get(page)).toEqual([]);
  expect(readbacks).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
    canvasHook: true,
    webglHook: true,
  });
});

test("a thousand rows use one bounded Canvas and cover both-axis scroll on the first frame", async ({
  page,
  browser,
}) => {
  await prepare(page, fixture(1000));
  await expect(page.locator(surface)).toHaveCount(1);
  const bounds = await page.locator(surface).evaluate((canvas) => {
    const node = canvas as HTMLCanvasElement,
      view = node.closest(".motion-timeline-scroll")!;
    return {
      width: node.width,
      height: node.height,
      dpr: devicePixelRatio,
      viewWidth: view.clientWidth,
      viewHeight: view.clientHeight,
      totalHeight: view.scrollHeight,
      bytes: Number(node.dataset.timelineBytes),
    };
  });
  expect(bounds.totalHeight).toBeGreaterThanOrEqual(24_000);
  expect(bounds.width).toBeLessThanOrEqual(Math.ceil(bounds.viewWidth * bounds.dpr));
  expect(bounds.height).toBeLessThanOrEqual(Math.ceil(bounds.viewHeight * bounds.dpr));
  expect(bounds.bytes).toBe(bounds.width * bounds.height * 4);
  const box = (await page.locator(surface).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  const quiet = await counters(page),
    samples = [];
  for (const [dx, dy] of [
    [260, 960],
    [260, 960],
    [260, 960],
    [-180, -720],
    [-180, -720],
  ]) {
    const sample = await firstScrollFrame(page, dx!, dy!);
    expect(sample.paintedTop).toBeCloseTo(sample.top, 3);
    expect(sample.paintedLeft).toBeCloseTo(sample.left, 3);
    expect(sample.first).toBeLessThanOrEqual(Math.floor(sample.top / 24));
    expect(sample.last).toBeGreaterThanOrEqual(Math.ceil((sample.top + sample.height) / 24));
    expect(sample.rows).toBeLessThanOrEqual(Math.ceil(sample.height / 24) + 2);
    expect(sample.items).toBeGreaterThan(0);
    samples.push(sample);
  }
  expect(samples[0]!.top).toBeGreaterThan(0);
  expect(samples[0]!.left).toBeGreaterThan(0);
  expect(await counters(page)).toEqual(quiet);
  const final = samples.at(-1)!;
  const png = await page.locator(surface).screenshot({ path: `${output}/thousand-rows.png` });
  const contrasts = await rowPixels(browser, png, final.top, final.height);
  expect(contrasts.length).toBeGreaterThan(2);
  expect(contrasts.every((contrast) => contrast > 3)).toBe(true);
  await writeFile(
    `${output}/first-scroll-frames.json`,
    JSON.stringify({ bounds, samples }, null, 2),
  );
});

test("Canvas key hits, decorative marquee and live drag preserve one undo and native easing", async ({
  page,
}) => {
  await prepare(page, fixture());
  await page.getByRole("spinbutton", { name: "Temps actuel", exact: true }).fill("2000");
  await page.keyboard.press("Enter");
  const start = await point(page, propertyLabel, 3),
    before = await authored(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await frames(page);
  const quiet = await counters(page),
    originalRevision = await revision(page),
    firstPaint = await paints(page);
  await page.mouse.move(start.x + start.scale / 2, start.y, { steps: 3 });
  expect(await revision(page)).toBe(originalRevision);
  expect(await authored(page)).toEqual(before);
  expect(await paints(page)).toBeGreaterThan(firstPaint);
  expect(await counters(page)).toEqual(quiet);
  await expect(page.locator(".motion-gesture-feedback")).toHaveText("3.500 s");
  await page.screenshot({ path: `${output}/key-draft.png` });
  await page.mouse.up();
  await expect.poll(() => revision(page)).toBe(originalRevision + 1);
  const moved = (await authored(page)).find((track) => track.id === "card-first")!;
  expect(motionTimeToSeconds(moved.properties[0]!.keyframes[1]!.time)).toBe(3.5);
  await undo(page);
  expect(await authored(page)).toEqual(before);

  const a = await point(page, propertyLabel, 2, -10),
    b = await point(page, propertyLabel, 5.2, 10);
  const unchanged = await revision(page);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await expect(page.locator(".motion-marquee")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(surface)).toHaveAttribute("data-timeline-selected-keys", "2");
  const middle = await point(page, propertyLabel, 3);
  await page.mouse.click(middle.x, middle.y, { button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Supprimer 2 images clés", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const easing = await point(page, propertyLabel, 4);
  await page.mouse.click(easing.x, easing.y);
  const dialog = page.getByRole("dialog", { name: "Interpolation", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(await revision(page)).toBe(unchanged);
  expect(await authored(page)).toEqual(before);
});

test("Canvas clip movement and trim preview immediately and each release needs only one undo", async ({
  page,
}) => {
  await prepare(page, fixture());
  const original = await authored(page);
  for (const action of ["move", "trim"] as const) {
    const origin = await point(page, layerLabel, action === "move" ? 2.5 : 6);
    await page.mouse.move(origin.x - (action === "trim" ? 3 : 0), origin.y);
    const barTarget = page.locator('.motion-canvas-active-overlay [data-track-id="card-first"]');
    await expect(barTarget).toBeVisible();
    const bar = await barTarget.boundingBox();
    const start = await point(page, layerLabel, 1);
    expect(bar).not.toBeNull();
    expect(bar!.x).toBeCloseTo(start.x, 0);
    expect(bar!.width).toBeCloseTo(origin.scale * 5, 0);
    await page.mouse.down();
    await frames(page);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    const quiet = await counters(page),
      startRevision = await revision(page),
      firstPaint = await paints(page);
    await page.mouse.move(origin.x + origin.scale / 2 - (action === "trim" ? 3 : 0), origin.y, {
      steps: 3,
    });
    expect(await revision(page)).toBe(startRevision);
    expect(await authored(page)).toEqual(original);
    expect(await paints(page)).toBeGreaterThan(firstPaint);
    expect(await counters(page)).toEqual(quiet);
    if (action === "trim") await expect(page.getByRole("tooltip")).toContainText(/5500\s*ms/);
    await page.screenshot({ path: `${output}/${action}-draft.png` });
    await page.mouse.up();
    await expect.poll(() => revision(page)).toBe(startRevision + 1);
    const changed = (await authored(page)).find((track) => track.id === "card-first")!;
    expect(motionTimeToSeconds(changed.start)).toBe(action === "move" ? 1.5 : 1);
    expect(motionTimeToSeconds(changed.end!)).toBe(6.5);
    await undo(page);
    expect(await authored(page)).toEqual(original);
  }
});

test("Play moves its own playhead without repainting the static Canvas body or React roots", async ({
  page,
}) => {
  await prepare(page, fixture());
  await page.getByRole("spinbutton", { name: "Temps actuel", exact: true }).fill("2000");
  await page.keyboard.press("Enter");
  await frames(page);
  const hover = await point(page, layerLabel, 2);
  const state = await page.evaluate(() => window.musart!.snapshot());
  const quiet = await counters(page);
  await page.mouse.move(hover.x, hover.y);
  await expect(page.locator('.canvas-timeline-hover[data-layer-id="card"]')).toBeVisible();
  await page.mouse.move(5, 5);
  await frames(page);
  expect(await counters(page)).toEqual(quiet);
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.mouse.move(5, 5);
  await frames(page);
  const initialPaint = await paints(page),
    playingRoots = await counters(page);
  const playhead = page.locator(".motion-playhead"),
    transform = await playhead.getAttribute("style");
  await page.waitForTimeout(240);
  expect(await playhead.getAttribute("style")).not.toBe(transform);
  expect(await paints(page)).toBe(initialPaint);
  expect(await counters(page)).toEqual(playingRoots);
  expect(await revision(page)).toBe(state.revision);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
});

test("active audio DOM overlays retain real fade and volume editors after Canvas hit testing", async ({
  page,
}) => {
  await prepare(page, fixture());
  await page.getByRole("button", { name: "Ajouter un son", exact: true }).click();
  const wav = sfxWav(synthesizeSfx("gentle-riser"));
  await page.locator('input[type="file"][accept="audio/*"]').setInputFiles({
    name: "Canvas riser.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from(await wav.arrayBuffer()),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.musart!.snapshot().project.pages[0]!.motion!.audioTracks?.length ?? 0,
      ),
    )
    .toBe(1);
  const snapshot = await page.evaluate(() => window.musart!.snapshot());
  const track = snapshot.project.pages[0]!.motion!.audioTracks![0]!;
  const label = `[data-audio-track-id="${track.id}"]`;
  const hit = await point(page, label, 0.5);
  await page.mouse.move(hit.x, hit.y);
  await page
    .locator(".motion-canvas-active-overlay")
    .getByRole("button", { name: "Fondu d’entrée", exact: true })
    .click();
  const editor = page.locator(".motion-audio-processing");
  await expect(editor).toBeVisible();
  await editor
    .getByRole("spinbutton", { name: "Durée du fondu d’entrée", exact: true })
    .fill("250");
  expect(await revision(page)).toBe(snapshot.revision);
  await editor.getByRole("button", { name: "Appliquer", exact: true }).click();
  await expect.poll(() => revision(page)).toBe(snapshot.revision + 1);
  const processing = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.motion!.audioTracks![0]!.processing,
  );
  expect(motionTimeToSeconds(processing!.fadeIn)).toBe(0.25);
  await undo(page);
  await page.mouse.click(hit.x, hit.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Volume", exact: true }).click();
  const volume = page.locator(".motion-audio-volume"),
    input = volume.getByRole("spinbutton");
  await expect(volume).toBeVisible();
  const before = await revision(page),
    quiet = await counters(page);
  await input.fill("25");
  await expect(volume.getByRole("slider", { name: "Volume", exact: true })).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  expect(await revision(page)).toBe(before);
  expect(await counters(page)).toEqual(quiet);
  await input.press("Enter");
  await expect.poll(() => revision(page)).toBe(before + 1);
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.motion!.audioTracks![0]!.volume,
    ),
  ).toBe(0.25);
  await expect(volume).toBeVisible();
  await page.evaluate(() => window.musart!.undo());
  await expect(volume).toBeVisible();
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.motion!.audioTracks![0]!.volume,
    ),
  ).toBe(1);
});

test("Canvas bar reorder and a real HTML gutter drop share stack order, labels and one-step undo", async ({
  page,
}) => {
  await verifyCanvasReorder(page);
});

test("Canvas gap duplication and clip right-click transition preserve independent occurrences", async ({
  page,
}) => {
  await prepare(page, fixture());
  const before = await page.evaluate(() => window.musart!.snapshot());
  const quiet = await counters(page),
    gap = await point(page, layerLabel, 7.5);
  await page.mouse.move(gap.x, gap.y);
  const ghost = page.locator(".motion-canvas-active-overlay .motion-gap-add:not([hidden])");
  await expect(ghost).toBeVisible();
  expect(await counters(page)).toEqual(quiet);
  expect(await revision(page)).toBe(before.revision);
  await ghost.click();
  await expect.poll(() => revision(page)).toBe(before.revision + 1);
  const copied = await page.evaluate(() => window.musart!.snapshot().project);
  const known = new Set(before.project.pages[0]!.motion!.tracks.map((track) => track.id));
  const addition = copied.pages[0]!.motion!.tracks.find((track) => !known.has(track.id))!;
  expect(copied.pages[0]!.layers).toEqual(before.project.pages[0]!.layers);
  expect(motionTimeToSeconds(addition.start)).toBe(7.5);
  expect(motionTimeToSeconds(addition.end!)).toBe(10);
  expect(addition.properties[0]!.keyframes.map((key) => motionTimeToSeconds(key.time))).toEqual([
    7.5, 9.5, 11.5,
  ]);
  const originalIds = new Set(
    before.project.pages[0]!.motion!.tracks.flatMap((track) => [
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
    ].every((id) => !originalIds.has(id)),
  ).toBe(true);
  await undo(page);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);

  const second = await point(page, layerLabel, 10.5),
    revisionBefore = await revision(page);
  await page.mouse.click(second.x, second.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Ajouter une transition au clip", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Transition", exact: true });
  await expect(editor).toBeVisible();
  await editor.screenshot({ path: `${output}/clip-context-transition.png` });
  await editor.getByRole("button", { name: "Ajouter une transition", exact: true }).click();
  await expect.poll(() => revision(page)).toBe(revisionBefore + 1);
  const transitioned = await authored(page);
  expect(transitioned.find((track) => track.id === "card-first")).toEqual(
    before.project.pages[0]!.motion!.tracks.find((track) => track.id === "card-first"),
  );
  const channel = transitioned
    .find((track) => track.id === "card-second")!
    .properties.find(
      (property) =>
        property.target.kind === "effectSetting" && property.target.property === "progress",
    )!;
  expect(channel.keyframes).toHaveLength(2);
  expect(channel.keyframes[0]!.time).toEqual({ value: 10, rate: 1 });
  await undo(page);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
});

for (const [id, name] of [
  ["sound-playground", "Sound Playground"],
  ["in-bloom", "In Bloom"],
  ["motion-stress-lab", "Motion Stress Lab"],
])
  test(`${name} keeps a bounded real Canvas timeline`, async ({ page }) => {
    await prepareTemplate(page, id === "motion-stress-lab" ? "Laboratoire Motion" : name);
    const canvas = page.locator(surface),
      box = (await canvas.boundingBox())!;
    await expect(canvas).toHaveCount(1);
    expect(Number(await canvas.getAttribute("data-timeline-items"))).toBeGreaterThan(0);
    expect(await canvas.evaluate((node) => (node as HTMLCanvasElement).height)).toBeLessThan(2000);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const sample = await firstScrollFrame(page, 180, 360);
    expect(sample.paintedTop).toBeCloseTo(sample.top, 3);
    expect(sample.paintedLeft).toBeCloseTo(sample.left, 3);
    await canvas.screenshot({ path: `${output}/${id}.png` });
  });

test("Canvas rows, bitmap and native drop proxy share a real intermediate spring pose", async ({
  page,
}) => {
  await verifyCanvasSpringPose(page);
});

test("dense Canvas key buckets retain bounded native choices and exact stored-key selection", async ({
  page,
}) => {
  const document = fixture();
  document.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes = Array.from(
    { length: 80 },
    (_, index) => ({
      id: `dense-${index}`,
      time: { value: 10000 + index, rate: 10000 },
      value: index,
    }),
  );
  await prepare(page, document);
  const before = await page.evaluate(() => window.musart!.snapshot()),
    p = await point(page, propertyLabel, 1);
  await page.mouse.click(p.x, p.y);
  const cluster = page.locator(".motion-key-cluster");
  await expect(cluster).toBeVisible();
  expect(await cluster.getByRole("listitem").count()).toBeLessThan(16);
  await cluster.getByRole("listitem").nth(1).getByRole("button").click();
  await expect(page.locator(surface)).toHaveAttribute("data-timeline-selected-keys", "1");
  await expect(page.getByRole("spinbutton", { name: "Temps actuel", exact: true })).toHaveValue(
    "1000.1",
  );
  await cluster.getByRole("button", { name: "Sélectionner ce groupe", exact: true }).click();
  await expect(page.locator(surface)).toHaveAttribute("data-timeline-selected-keys", "80");
  await cluster.getByRole("button", { name: "Zoomer sur ce groupe", exact: true }).click();
  await expect(cluster).toBeHidden();
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
  expect(await revision(page)).toBe(before.revision);
});
