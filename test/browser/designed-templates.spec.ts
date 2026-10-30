import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const artifacts = "artifacts/motion/templates-gallery";
const motionNames = [
  "Orbit Study",
  "Paper Motion",
  "Atlas des transitions",
  "In Bloom — Démo Motion",
  "Laboratoire Motion",
  "Sound Playground",
];

async function filter(page: Page, gallery: Locator, mode: "Motion" | "Statique") {
  await gallery.getByRole("combobox", { name: "Mode du modèle", exact: true }).click();
  await page.getByRole("option", { name: mode, exact: true }).click();
}

async function presented(page: Page, projectId: string, pageId: string) {
  await expect(
    page.locator(
      `.canvas-artboard canvas[data-renderer-ready="true"][data-project-id="${projectId}"][data-page-id="${pageId}"]`,
    ),
  ).toBeVisible({ timeout: 20000 });
}

test("real gallery filters templates, creates an independent Motion project and restores it from storage", async ({
  page,
}) => {
  test.setTimeout(40000);
  await mkdir(artifacts, { recursive: true });
  // Expected document only: the template is opened through its real gallery card.
  const source = JSON.parse(
    await readFile("apps/web/public/templates/designed/orbit-study.json", "utf8"),
  ) as { project: Project };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
  });
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 20000 });
  const initialId = await page.evaluate(() => window.musart!.snapshot().project.id);
  await page.getByRole("button", { name: "Menu du projet", exact: true }).click();
  const gallery = page.getByRole("dialog", { name: "Tableau de bord MusArt", exact: true });
  await gallery.getByRole("tab", { name: "Templates", exact: true }).click();
  await filter(page, gallery, "Motion");
  await expect(gallery.locator(".template-card")).toHaveCount(6);
  for (const name of motionNames)
    await expect(
      gallery.getByRole("button", { name: `Créer depuis ${name}`, exact: true }),
    ).toBeVisible();
  await expect(gallery.locator('.template-card [data-mode="motion"]')).toHaveCount(6);
  await gallery.screenshot({ path: `${artifacts}/motion-gallery.png` });

  await filter(page, gallery, "Statique");
  await expect(
    gallery.getByRole("button", { name: "Créer depuis Colorfield", exact: true }),
  ).toBeVisible();
  await expect(gallery.locator('.template-card [data-mode="motion"]')).toHaveCount(0);
  await expect(
    gallery.getByRole("button", { name: "Créer depuis Orbit Study", exact: true }),
  ).toHaveCount(0);
  await filter(page, gallery, "Motion");
  const orbit = gallery.getByRole("button", { name: "Créer depuis Orbit Study", exact: true });
  await expect
    .poll(() =>
      orbit
        .locator("img")
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await orbit.click();
  await expect(gallery).toBeHidden();
  const opened = await page.evaluate(() => window.musart!.snapshot().project);
  expect(opened.id).not.toBe(initialId);
  expect(opened.id).not.toBe(source.project.id);
  expect(opened.name).toBe(source.project.name);
  expect(opened.pages).toEqual(source.project.pages);
  expect(opened.pages[0]!.motion?.mode).toBe("motion");
  await presented(page, opened.id, opened.pages[0]!.id);
  await page.screenshot({ path: `${artifacts}/orbit-opened.png` });

  await page.evaluate(async () => {
    await window.musart!.save();
    await window.musart!.flush();
  });
  const saved = await page.evaluate(() => ({
    project: window.musart!.snapshot().project,
    readbacks: window.__musartVideoReadbacks,
  }));
  expect(saved.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  // A genuine navigation retains IndexedDB. No automation.load or fixture query runs on reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction((id) => window.musart?.snapshot().project.id === id, opened.id, {
    timeout: 20000,
  });
  const restored = await page.evaluate(() => ({
    project: window.musart!.snapshot().project,
    readbacks: window.__musartVideoReadbacks,
  }));
  expect(restored.project.id).toBe(saved.project.id);
  expect(restored.project.name).toBe(saved.project.name);
  expect(restored.project.pages).toEqual(saved.project.pages);
  expect(restored.project.assets).toEqual(saved.project.assets);
  expect(restored.project.pages[0]!.motion?.mode).toBe("motion");
  await presented(page, opened.id, opened.pages[0]!.id);
  await page.screenshot({ path: `${artifacts}/orbit-restored.png` });
  const afterReloadReadbacks = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(afterReloadReadbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await writeFile(
    `${artifacts}/gallery-persistence.json`,
    JSON.stringify(
      {
        motionNames,
        staticIncludes: "Colorfield",
        sourceId: source.project.id,
        initialId,
        createdId: opened.id,
        restoredId: restored.project.id,
        documentRestored: true,
        mode: restored.project.pages[0]!.motion?.mode,
        beforeReloadReadbacks: saved.readbacks,
        afterReloadReadbacks,
      },
      null,
      2,
    ),
  );
});
