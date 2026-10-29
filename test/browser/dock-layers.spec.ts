import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import { installNativeDragProbe, assertNativeMove } from "./support/native-drag";

async function ready(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    if (!localStorage.getItem("musart.dock.commands"))
      localStorage.setItem("musart.dock.commands", '["action:addPage"]');
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
}

async function layerOrder(page: Page) {
  return page
    .locator('[role="tree"] [data-layer-id]')
    .evaluateAll((rows) =>
      rows
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map((row) => row.getAttribute("data-layer-id")),
    );
}
async function snapshotOrder(page: Page) {
  return page.evaluate(() =>
    window.musart!.snapshot().project.pages[0]!.layers.map((layer) => layer.id),
  );
}

test("compact header and dock expose real commands, persist pins and support keyboard customization", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator(".project-trigger .magic-search-trigger")).toHaveCount(0);
  await expect(page.locator('.project-trigger [role="tablist"]')).toHaveCount(0);
  const heights = await page
    .locator(".brand-button, .project-pill")
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(new Set(heights)).toEqual(new Set([42]));
  const search = page.locator(".toolbar .magic-search-trigger");
  await expect(search).toHaveText("");
  await search.click();
  await expect(page.getByRole("dialog", { name: "Rechercher dans MusArt" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Personnaliser le dock", exact: true }).click();
  const customize = page.locator(".dock-customizer");
  await customize.getByRole("searchbox").fill("recentrer");
  await customize.getByRole("button", { name: "Épingler Recentrer la vue", exact: true }).click();
  await customize.getByRole("button", { name: "Monter Recentrer la vue", exact: true }).focus();
  await page.keyboard.press("Enter");
  const expected = ["action:recenter", "action:addPage"];
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("musart.dock.commands")!)))
    .toEqual(expected);
  await page.keyboard.press("Escape");
  // Reload without rerunning the initial localStorage seed.
  await page.evaluate(() => location.reload());
  await page.waitForFunction(() => Boolean(window.musart));
  await expect
    .poll(() =>
      page
        .locator(".dock-pinned [data-dock-command]")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-dock-command")),
        ),
    )
    .toEqual(expected);
  const pinnedPage = page.locator('[data-dock-command="action:addPage"]');
  const pinnedRecenter = page.locator('[data-dock-command="action:recenter"]');
  await installNativeDragProbe(page, "application/x-musart-dock-command");
  await pinnedPage.dragTo(pinnedRecenter, { targetPosition: { x: 16, y: 3 } });
  await assertNativeMove(page, "action:addPage");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("musart.dock.commands")!)))
    .toEqual(["action:addPage", "action:recenter"]);
  const before = await page.evaluate(() => window.musart!.snapshot().project.pages.length);
  await page.locator('[data-dock-command="action:addPage"] button').click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
    .toBe(before + 1);
  await page.screenshot({ path: "artifacts/screenshots/dock-compact-header.png" });
});

test("native layer drag projects its order before one document commit and Escape restores it", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await ready(page);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          width: 400,
          height: 400,
          layers: [
            createLayer("rectangle", { id: "a", name: "A", fill: "#2b60ff" }),
            createLayer("rectangle", { id: "b", name: "B", fill: "#e97344", x: 70 }),
            createLayer("rectangle", { id: "c", name: "C", fill: "#52b39c", x: 140 }),
          ],
        }),
      ],
    }),
  );
  await expect.poll(() => layerOrder(page)).toEqual(["c", "b", "a"]);
  async function hoverDrag() {
    const source = await page.locator('[data-layer-id="a"]').boundingBox();
    const target = await page.locator('[data-layer-id="c"]').boundingBox();
    if (!source || !target) throw Error("Missing layer row");
    await page.mouse.move(source.x + 100, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + 105, source.y + source.height / 2, { steps: 3 });
    await page.mouse.move(target.x + 100, target.y + 2, { steps: 12 });
    await page.mouse.move(target.x + 101, target.y + 2);
  }
  await installNativeDragProbe(page, "application/x-musart-layer");
  await hoverDrag();
  await expect.poll(() => layerOrder(page)).toEqual(["a", "c", "b"]);
  expect(await snapshotOrder(page)).toEqual(["a", "b", "c"]);
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  await page.screenshot({ path: "artifacts/screenshots/layers-held-drag.png" });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(() => layerOrder(page)).toEqual(["c", "b", "a"]);
  expect(await snapshotOrder(page)).toEqual(["a", "b", "c"]);
  await expect(page.locator('[data-layer-id="a"]')).toHaveCSS("transform", "none");
  await hoverDrag();
  await expect.poll(() => layerOrder(page)).toEqual(["a", "c", "b"]);
  await page.mouse.up();
  await expect.poll(() => snapshotOrder(page)).toEqual(["b", "c", "a"]);
  await assertNativeMove(page, "a");
  await page.keyboard.press("Control+z");
  await expect.poll(() => snapshotOrder(page)).toEqual(["a", "b", "c"]);
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => snapshotOrder(page)).toEqual(["b", "c", "a"]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    gpuHook: true,
    canvasHook: true,
  });
});

test("native group and Alt-mask drops preserve semantic commands and undo", async ({ page }) => {
  await ready(page);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("rectangle", { id: "a", name: "Source", x: 50, y: 60 }),
            createLayer("rectangle", { id: "b", name: "Target", x: 100, y: 90 }),
            createLayer("group", { id: "g", name: "Group", x: 20, y: 30 }),
          ],
        }),
      ],
    }),
  );
  const source = page.locator('[data-layer-id="a"]'),
    group = page.locator('[data-layer-id="g"]');
  await group.getByRole("button", { name: "Group", exact: true }).click();
  await source.dragTo(group);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.layers.find((layer) => layer.id === "a")!
            .parentId,
      ),
    )
    .toBe("g");
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.layers.find((layer) => layer.id === "a")!
            .parentId,
      ),
    )
    .toBeNull();
  await expect(source).toHaveCSS("transform", "none");
  await page.keyboard.down("Alt");
  await source.dragTo(page.locator('[data-layer-id="b"]'));
  await page.keyboard.up("Alt");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.layers.find((layer) => layer.id === "b")!.mask
            ?.layerId,
      ),
    )
    .toBe("a");
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.layers.find((layer) => layer.id === "b")!
            .mask,
      ),
    )
    .toBeNull();
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
});

test("a short viewport scrolls all twelve pinned commands with bounded menus and boundary shadows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 320 });
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
  await ready(page);
  const viewport = page.locator("[data-dock-scroll]"),
    shadow = page.locator(".toolbar-scroll");
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  const dock = await page.locator(".toolbar").boundingBox();
  expect(dock!.y).toBeGreaterThanOrEqual(0);
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(320);
  await expect(shadow).toHaveAttribute("data-overflow-bottom", "");
  await expect(shadow).not.toHaveAttribute("data-overflow-top", "");
  expect(
    await page
      .locator(".toolbar .tool-button")
      .first()
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBe(33);
  await viewport.hover();
  await page.mouse.wheel(0, 4000);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(shadow).toHaveAttribute("data-overflow-top", "");
  await expect(page.locator('[data-dock-command="action:fit"]')).toBeVisible();
  await page.getByRole("button", { name: "Personnaliser le dock", exact: true }).click();
  const customizer = page.locator(".dock-customizer");
  const box = await customizer.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  expect(await customizer.locator('[role="listitem"]').count()).toBeLessThan(25);
  await customizer.getByRole("searchbox").fill("recentrer");
  await expect(
    customizer
      .getByRole("list")
      .getByRole("button", { name: "Désépingler Recentrer la vue", exact: true }),
  ).toBeVisible();
  const ring = await customizer
    .getByRole("searchbox")
    .evaluate((element) => getComputedStyle(element).boxShadow);
  expect(ring).not.toContain("3px");
  await page.screenshot({ path: "artifacts/screenshots/dock-short-viewport-scroll.png" });
});
