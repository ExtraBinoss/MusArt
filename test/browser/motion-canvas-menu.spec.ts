import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

test("canvas right-click targets the visible occurrence and preserves right-drag selection", async ({
  page,
}) => {
  test.setTimeout(40000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
  });
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  const layer = createLayer("rectangle", {
    id: "menu-card",
    name: "Menu card",
    x: 120,
    y: 100,
    width: 240,
    height: 160,
    fill: "#e6b080",
  });
  const engine = new EditorEngine(
    createProject({
      id: crypto.randomUUID(),
      pages: [createPage({ id: "menu-page", width: 640, height: 480, layers: [layer] })],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 40, rate: 1 } });
  const first = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  engine.execute({
    type: "setMotionTrackRange",
    trackId: first.id,
    start: { value: 0, rate: 1 },
    end: { value: 20, rate: 1 },
  });
  engine.execute({
    type: "addMotionOccurrence",
    layerId: layer.id,
    start: { value: 20, rate: 1 },
    end: { value: 40, rate: 1 },
  });
  const project = engine.getSnapshot().project;
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["menu-card"]);
  }, project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  const selection = page.locator('.canvas-selection[data-layer-id="menu-card"]');
  const box = await selection.boundingBox();
  if (!box) throw Error("The native selection has no visible geometry.");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await page.mouse.click(point.x, point.y, { button: "right" });
  const action = page.getByRole("menuitem", { name: "Ajouter une animation", exact: true });
  await expect(action).toBeVisible();
  const remove = page.getByRole("menuitem", { name: "Supprimer", exact: true });
  await expect(remove).toHaveAttribute("data-variant", "destructive");
  expect(await remove.evaluate((node) => node.previousElementSibling?.getAttribute("role"))).toBe(
    "separator",
  );
  // The modal menu correctly hides its background controls from the accessibility tree.
  await expect(page.locator('.motion-timeline button[aria-label="Lire"]')).toBeVisible();
  await action.click();
  const editor = page.getByRole("dialog", { name: "Ajouter une animation", exact: true });
  await expect(editor).toBeVisible();
  await editor.screenshot({ path: "artifacts/motion/ui/canvas-transition.png" });
  await editor.getByRole("textbox", { name: "Rechercher une animation…" }).fill("Fade");
  await editor.getByRole("button", { name: "Fade", exact: true }).click();
  const authored = await page.evaluate(() => window.musart!.snapshot());
  const tracks = authored.project.pages[0]!.motion!.tracks;
  expect(tracks).toHaveLength(2);
  expect(tracks.find((track) => track.id === first.id)!.animations).toHaveLength(1);
  expect(tracks.find((track) => track.id !== first.id)!.properties).toHaveLength(0);
  expect(authored.project.pages[0]!.layers).toHaveLength(1);
  await page.evaluate(() => window.musart!.undo());
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(project);
  await page.mouse.move(box.x - 20, box.y - 20);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width + 20, box.y + box.height + 20, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect((await page.evaluate(() => window.musart!.snapshot())).selection).toEqual([layer.id]);
  const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await mkdir("artifacts/motion/ui", { recursive: true });
  await writeFile(
    "artifacts/motion/ui/canvas-context.json",
    JSON.stringify({ trackId: first.id, readbacks, authored }, null, 2),
  );
});
