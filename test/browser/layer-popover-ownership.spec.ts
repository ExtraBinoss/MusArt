import { expect, test, type Locator, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { visibleThumbnailsReady } from "./support/selection-profile";

async function settledHandoff(page: Page) {
  await page.locator(".layer-attachment-popover").evaluateAll(async (nodes) => {
    await Promise.all(
      nodes
        .flatMap((node) => node.getAnimations({ subtree: true }))
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

test("attachment editors have one global owner across effects, masks and duplicate triggers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const mask = await page.evaluate(() => {
    const image = document.createElement("canvas");
    image.width = image.height = 8;
    const context = image.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 8, 8);
    return image.toDataURL("image/png");
  });
  const first = createLayer("rectangle", {
    id: "popover-first",
    name: "First owner",
    x: 24,
    y: 32,
    width: 128,
    height: 128,
    fill: "#6688bb",
    effects: [
      createEffect("grayscale", { id: "first-gray", enabled: false }),
      createEffect("contrast", { id: "first-contrast", enabled: false, amount: 1 }),
    ],
    mask: { assetId: "popover-mask", enabled: true, inverted: false, mode: "alpha" },
  });
  const second = createLayer("rectangle", {
    id: "popover-second",
    name: "Second owner",
    x: 200,
    y: 32,
    width: 128,
    height: 128,
    fill: "#ee9966",
    effects: [createEffect("brightness", { id: "second-brightness", enabled: false, amount: 1 })],
  });
  const project = createProject({
    id: "attachment-ownership-fixture",
    pages: [
      createPage({
        width: 384,
        height: 220,
        layers: [first, second],
      }),
    ],
    assets: {
      "popover-mask": {
        id: "popover-mask",
        name: "Opaque native mask",
        width: 8,
        height: 8,
        mime: "image/png",
        dataUrl: mask,
      },
    },
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  await page.waitForFunction((id) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      canvas?.projectId === id &&
      canvas.rendererReady === "true" &&
      canvas.sceneRevision === canvas.renderedRevision
    );
  }, project.id);
  await page.evaluate(() => window.musart!.flushThumbnails());
  await visibleThumbnailsReady(page);
  const firstRow = page.locator(`.layer-row[data-layer-id="${first.id}"]`);
  const secondRow = page.locator(`.layer-row[data-layer-id="${second.id}"]`);
  const grayAvatar = firstRow.locator('[data-attachment-effect-id="first-gray"]');
  const contrastAvatar = firstRow.locator('[data-attachment-effect-id="first-contrast"]');
  const brightnessAvatar = secondRow.locator('[data-attachment-effect-id="second-brightness"]');
  const maskAvatar = firstRow.locator('[data-attachment-target="mask"]');
  await firstRow.getByRole("button", { name: first.name, exact: true }).click();
  const grayExpanded = page.locator('[data-effect-id="first-gray"] [data-slot="popover-trigger"]');
  const maskExpanded = page.locator(`[data-mask-for="${first.id}"] [data-slot="popover-trigger"]`);
  await expect(grayExpanded).toBeVisible();
  await expect(maskExpanded).toBeVisible();
  const baseline = await page.evaluate(() => window.musart!.snapshot());
  const hops: {
    label: string;
    contentId: string;
    expandedTriggers: number;
    focusInside: boolean;
  }[] = [];
  const open = page.locator('.layer-attachment-popover[data-state="open"]');
  async function unchanged() {
    const snapshot = await page.evaluate(() => window.musart!.snapshot());
    expect(snapshot.project).toEqual(baseline.project);
    expect(snapshot.revision).toBe(baseline.revision);
    expect(snapshot.canUndo).toBe(baseline.canUndo);
    expect(snapshot.canRedo).toBe(baseline.canRedo);
  }
  async function handoff(trigger: Locator, label: string) {
    const geometry = await trigger.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      return {
        trigger: bounds.toJSON(),
        hit: hit?.outerHTML.slice(0, 300),
        accessible: hit !== null && node.contains(hit),
        popovers: [...document.querySelectorAll(".layer-attachment-popover")].map((popup) => ({
          bounds: popup.getBoundingClientRect().toJSON(),
          state: popup.getAttribute("data-state"),
          animations: popup.getAnimations({ subtree: true }).map((animation) => ({
            state: animation.playState,
            time: animation.currentTime,
            timing: animation.effect?.getComputedTiming(),
          })),
        })),
      };
    });
    await mkdir("artifacts/layer-popover-ownership", { recursive: true });
    await writeFile(
      `artifacts/layer-popover-ownership/last-handoff.json`,
      JSON.stringify({ label, geometry }, null, 2),
    );
    await trigger.click({ timeout: 3000 });
    await expect(open).toHaveCount(1);
    const id = await trigger.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    await expect(open).toHaveAttribute("id", id!);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const expanded = page.locator(
      '.layer-row [data-slot="popover-trigger"][aria-expanded="true"],.layer-attachment-row [data-slot="popover-trigger"][aria-expanded="true"]',
    );
    await expect(expanded).toHaveCount(1);
    await settledHandoff(page);
    const focusInside = await open.evaluate((node) => node.contains(document.activeElement));
    expect(
      focusInside,
      `${label}: the previous editor must not reclaim focus during its exit`,
    ).toBe(true);
    await unchanged();
    hops.push({ label, contentId: id!, expandedTriggers: await expanded.count(), focusInside });
    return id!;
  }
  async function draft() {
    const amount = open.getByRole("textbox", { name: "Intensité", exact: true });
    await expect(amount).toHaveValue("100");
    await amount.fill("30");
    await expect(amount).toHaveValue("30");
    await unchanged();
  }
  try {
    const grayAvatarId = await handoff(grayAvatar, "first effect avatar");
    await draft();
    await handoff(contrastAvatar, "another effect on the same layer");
    await expect(grayAvatar).toHaveAttribute("aria-expanded", "false");
    await draft();
    await handoff(brightnessAvatar, "effect on another layer");
    await expect(contrastAvatar).toHaveAttribute("aria-expanded", "false");
    await draft();
    await handoff(maskAvatar, "mask after an effect");
    await expect(brightnessAvatar).toHaveAttribute("aria-expanded", "false");
    await expect(open).toHaveAccessibleName(`Masque · ${first.name}`);
    await handoff(grayAvatar, "return to the original effect");
    await expect(open.getByRole("textbox", { name: "Intensité", exact: true })).toHaveValue("100");
    await draft();
    const grayExpandedId = await handoff(grayExpanded, "same effect through its expanded row");
    expect(grayExpandedId).not.toBe(grayAvatarId);
    await expect(grayAvatar).toHaveAttribute("aria-expanded", "false");
    await expect(open.getByRole("textbox", { name: "Intensité", exact: true })).toHaveValue("100");
    await handoff(grayAvatar, "same effect back through its avatar");
    await expect(grayExpanded).toHaveAttribute("aria-expanded", "false");
    await handoff(maskAvatar, "mask avatar");
    const maskAvatarId = await maskAvatar.getAttribute("aria-controls");
    const maskExpandedId = await handoff(maskExpanded, "same mask through its expanded row");
    expect(maskExpandedId).not.toBe(maskAvatarId);
    await expect(maskAvatar).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Escape");
    await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
    await expect(maskExpanded).toBeFocused();
    await maskExpanded.press("Enter");
    await expect(open).toHaveCount(1);
    await expect(open).toHaveAttribute("id", maskExpandedId);
    await settledHandoff(page);
    expect(await open.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
    await expect(maskExpanded).toBeFocused();
    await handoff(grayExpanded, "expanded effect keyboard return target");
    await mkdir("artifacts/layer-popover-ownership", { recursive: true });
    await page.screenshot({ path: "artifacts/layer-popover-ownership/expanded-effect.png" });
    await page.keyboard.press("Escape");
    await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
    await expect(grayExpanded).toBeFocused();
    await unchanged();
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(errors).toEqual([]);
  } finally {
    await mkdir("artifacts/layer-popover-ownership", { recursive: true });
    await writeFile(
      `artifacts/layer-popover-ownership/${process.env.MUSART_POPOVER_COHORT ?? "candidate"}.json`,
      JSON.stringify(
        {
          fixture: { layers: 2, disabledEffects: 3, masks: 1, expandedDuplicateOwners: 2 },
          hops,
          errors,
          reads: await page.evaluate(() => window.__musartVideoReadbacks),
          document: await page.evaluate(() => ({
            revision: window.musart!.snapshot().revision,
            canUndo: window.musart!.snapshot().canUndo,
          })),
        },
        null,
        2,
      ),
    );
  }
});
