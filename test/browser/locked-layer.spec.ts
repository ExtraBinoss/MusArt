import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir } from "node:fs/promises";
import { i18n } from "../../apps/web/src/state/i18n";
import { messages } from "../../apps/web/src/components/properties/locked/messages";
import { installReadbackProbe } from "./support/readback-probe";

test("locked artwork remains selectable and every property panel unlocks only its blocking chain", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const mask = { layerId: "mask-source", mode: "alpha" as const, enabled: true, inverted: false };
  const project = createProject({
    pages: [
      createPage({
        width: 640,
        height: 480,
        layers: [
          createLayer("rectangle", {
            id: "back",
            x: 40,
            y: 40,
            width: 200,
            height: 180,
            fill: "#2563eb",
          }),
          createLayer("rectangle", {
            id: "front",
            name: "Locked front",
            x: 80,
            y: 80,
            width: 120,
            height: 120,
            locked: true,
            fill: "#e86d35",
          }),
          createLayer("group", {
            id: "outer",
            name: "Outer protection",
            x: 330,
            y: 60,
            width: 220,
            height: 300,
            locked: true,
          }),
          createLayer("group", {
            id: "inner",
            name: "Inner protection",
            parentId: "outer",
            x: 0,
            y: 0,
            width: 200,
            height: 280,
            locked: true,
          }),
          createLayer("rectangle", {
            id: "child",
            name: "Inherited child",
            parentId: "inner",
            x: 10,
            y: 10,
            width: 120,
            height: 110,
            mask,
            effects: [createEffect("contrast", { id: "locked-fx" })],
          }),
          createLayer("rectangle", {
            id: "sibling",
            parentId: "inner",
            x: 10,
            y: 150,
            width: 50,
            height: 50,
            locked: true,
          }),
          createLayer("rectangle", {
            id: "mask-source",
            maskSource: true,
            x: 0,
            y: 0,
            width: 640,
            height: 480,
            fill: "#ffffff",
          }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  await expect(page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  const board = page.getByTestId("artboard");
  await expect(board).toHaveAttribute("data-view-moving", "false");
  const box = (await board.boundingBox())!;
  const point = { x: box.x + (box.width * 130) / 640, y: box.y + (box.height * 130) / 480 };
  const read = () => page.evaluate(() => window.musart!.snapshot());
  await page.mouse.click(point.x, point.y);
  expect((await read()).selection).toEqual(["front"]);
  const frame = page.locator('.canvas-selection[data-layer-id="front"]');
  await expect(frame.locator(".canvas-layer-lock")).toBeVisible();
  await expect(frame.locator("[data-handle]")).toHaveCount(0);
  const locked = await read();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 40, point.y + 30, { steps: 5 });
  await page.mouse.up();
  expect((await read()).project).toEqual(locked.project);
  expect((await read()).revision).toBe(locked.revision);
  await page.mouse.move(10, 990);
  const row = page.locator('.layer-row[data-layer-id="front"]');
  await expect(row).toHaveAttribute("data-locked", "true");
  await expect(row.locator(".layer-actions")).toHaveCSS("opacity", "1");
  await expect(row.locator(".layer-lock-label")).toBeVisible();
  const inspector = page.locator(".inspector");
  await expect(inspector.locator(".locked-layer-notice")).toContainText(messages.fr.locked);
  await inspector.getByRole("button", { name: messages.fr.unlock, exact: true }).click();
  expect((await read()).revision).toBe(locked.revision + 1);
  await page.getByRole("button", { name: i18n.t("undo"), exact: true }).click();
  expect((await read()).project).toEqual(locked.project);
  expect((await read()).canUndo).toBe(false);
  await page.getByRole("button", { name: i18n.t("redo"), exact: true }).click();
  await expect(frame.locator("[data-handle]")).toHaveCount(5);
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["child"]);
  }, project);
  const notice = inspector.locator(".locked-layer-notice");
  await expect(notice).toContainText("Outer protection");
  await expect(notice).toContainText("Inner protection");
  await expect(inspector.getByRole("textbox", { name: "X", exact: true })).toBeDisabled();
  const childRow = page.locator('.layer-row[data-layer-id="child"]');
  await expect(childRow).toHaveAttribute("data-lock-inherited", "true");
  for (const kind of ["effect", "mask"] as const) {
    await childRow.locator(`[data-attachment-target="${kind}"]`).click();
    const popup = page.locator(".layer-attachment-popover");
    await expect(popup.locator(".locked-layer-notice")).toContainText("Outer protection");
    await expect(popup.locator(".locked-layer-notice")).toContainText("Inner protection");
    if (kind === "effect") await expect(popup.locator("[data-effect-reset]")).toBeDisabled();
    else await expect(popup.getByRole("combobox").first()).toBeDisabled();
    const before = await read();
    await popup.getByRole("button", { name: messages.fr.unlock, exact: true }).click();
    const after = await read(),
      byId = new Map(after.project.pages[0]!.layers.map((item) => [item.id, item]));
    expect(after.revision).toBe(before.revision + 1);
    expect(["outer", "inner", "child"].map((id) => byId.get(id)!.locked)).toEqual([
      false,
      false,
      false,
    ]);
    expect(byId.get("sibling")!.locked).toBe(true);
    expect(byId.get("front")!.locked).toBe(true);
    expect(byId.get("child")!.effects).toEqual(
      before.project.pages[0]!.layers.find((item) => item.id === "child")!.effects,
    );
    expect(byId.get("child")!.mask).toEqual(
      before.project.pages[0]!.layers.find((item) => item.id === "child")!.mask,
    );
    await page.getByRole("button", { name: i18n.t("undo"), exact: true }).click();
    expect((await read()).project).toEqual(before.project);
    expect((await read()).canUndo).toBe(false);
    await expect(popup).toHaveCount(0);
    await page.getByRole("button", { name: i18n.t("redo"), exact: true }).click();
    expect((await read()).project).toEqual(after.project);
    await page.getByRole("button", { name: i18n.t("undo"), exact: true }).click();
  }
  await mkdir("artifacts/locked-layer", { recursive: true });
  await page.screenshot({ path: "artifacts/locked-layer/locked-properties.png" });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
