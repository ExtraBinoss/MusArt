import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";

test("Keyframes exposes editable preset points and vertical ruler labels remain inside the strip", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          width: 480,
          height: 320,
          rulers: true,
          layers: [createLayer("rectangle", { id: "hero", name: "Card", width: 100, height: 80 })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const trackId = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  engine.execute({
    type: "addMotionAnimation",
    trackId,
    start: { value: 0, rate: 1 },
    preset: {
      version: 1,
      id: "test-move",
      name: "Move",
      category: "move",
      duration: 2000,
      effects: [],
      channels: [
        {
          target: { kind: "layer", property: "x" },
          operation: "add",
          unit: "width",
          points: [
            { at: 0, value: -1 },
            { at: 0.5, value: -0.25 },
            { at: 1, value: 0 },
          ],
        },
      ],
    },
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["hero"]);
  }, engine.getSnapshot().project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await expect(page.locator(".ruler-y text").first()).toBeAttached();
  const labels = await page.locator(".ruler-y text").evaluateAll((nodes) =>
    nodes.map((node) => {
      const text = node.getBoundingClientRect(),
        ruler = node.closest(".ruler-y")!.getBoundingClientRect();
      return { left: text.left - ruler.left, right: text.right - ruler.left, width: ruler.width };
    }),
  );
  expect(labels.length).toBeGreaterThan(2);
  expect(labels.every((label) => label.left >= 0 && label.right <= label.width)).toBe(true);
  await page.locator(".ruler-y").screenshot({ path: "artifacts/ruler-left.png" });
  await page.locator(".motion-timeline-dock").hover();
  const pin = page.getByRole("button", { name: "Pin timeline", exact: true });
  if (await pin.isVisible()) await pin.click();
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
  const row = page.locator(".motion-row.is-property[data-labels-only]").first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Move");
  const ruler = await page.locator(".motion-ruler").boundingBox();
  const label = await row.locator(".motion-row-label").boundingBox();
  if (!ruler || !label) throw Error("Detailed timeline missing");
  const scale = await page
    .locator(".motion-end-marker")
    .evaluate((node) => Number.parseFloat((node as HTMLElement).style.left) / 2);
  const x = ruler.x + scale,
    y = label.y + label.height / 2;
  await page.mouse.move(x, y);
  const marker = page.locator(".motion-canvas-active-overlay .motion-key");
  await expect(marker).toBeVisible();
  const before = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.mouse.down();
  await page.mouse.move(x + scale / 4, y, { steps: 4 });
  await page.mouse.up();
  const moved = await page.evaluate(() => window.musart!.snapshot());
  expect(moved.revision).toBe(before + 1);
  expect(moved.project.pages[0]!.motion!.tracks[0]!.properties).toHaveLength(0);
  expect(
    moved.project.pages[0]!.motion!.tracks[0]!.animations![0]!.preset.channels[0]!.points[1]!.at,
  ).toBeCloseTo(0.625, 2);
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.motion!.tracks[0]!.animations![0]!.preset
          .channels[0]!.points[1]!.at,
    ),
  ).toBe(0.5);
  await page.getByRole("button", { name: "Animations", exact: true }).click();
  await expect(page.locator(".motion-row.is-property[data-labels-only]")).toHaveCount(0);
  await expect(page.locator(".motion-animation-block")).toHaveCount(1);
});
