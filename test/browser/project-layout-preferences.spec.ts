import { expect, test, type Locator, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir } from "node:fs/promises";
import type { ProjectLayoutPreferences } from "../../apps/web/src/services/projects/preferences/model";

function fixture(name: string) {
  const layer = createLayer("rectangle", { width: 240, height: 160, fill: "#8B5CF6" });
  return createProject({
    name,
    pages: [
      createPage({
        width: 800,
        height: 600,
        layers: [layer],
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 5, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "layout-track",
              layerId: layer.id,
              start: { value: 0, rate: 1 },
              end: null,
              properties: [],
            },
          ],
        },
      }),
    ],
  });
}

async function ready(page: Page, project = fixture("Layout project A")) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.theme", "dark");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    await window.musart!.save();
  }, project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
  await expect(page.locator(".motion-timeline-dock")).toHaveAttribute("data-motion-pinned", "true");
  return project;
}

async function stored(
  page: Page,
  projectId: string,
): Promise<ProjectLayoutPreferences | undefined> {
  return page.evaluate(
    (id) =>
      new Promise<ProjectLayoutPreferences | undefined>((resolve, reject) => {
        const opening = indexedDB.open("musart-studio");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction("preferences");
          const request = transaction
            .objectStore("preferences")
            .get(JSON.stringify(["musart:project-layout", id]));
          let value: ProjectLayoutPreferences | undefined;
          request.onsuccess = () => {
            const raw: unknown = request.result;
            if (typeof raw === "string")
              value = (JSON.parse(raw) as { version: 1; values: ProjectLayoutPreferences }).values;
          };
          transaction.oncomplete = () => {
            db.close();
            resolve(value);
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
    projectId,
  );
}

async function drag(page: Page, locator: Locator, dx: number, dy: number) {
  const bounds = (await locator.boundingBox())!;
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

async function geometry(page: Page) {
  return page.evaluate(() => ({
    sidebar: document.querySelector(".sidebar")!.getBoundingClientRect().width,
    properties: document
      .querySelector(".sidebar-panels > [data-slot=resizable-panel]")!
      .getBoundingClientRect().height,
    timeline: document.querySelector(".motion-timeline")!.getBoundingClientRect().height,
  }));
}

test("native split, height and zoom gestures persist across a genuine IndexedDB reload", async ({
  page,
}) => {
  const project = await ready(page);
  const initial = await geometry(page);
  const before = await page.evaluate(() => ({
    revision: window.musart!.snapshot().revision,
    renders: document.querySelector<HTMLElement>(".musart-app")!.dataset.reactRenders,
  }));
  await drag(page, page.locator(".sidebar-resize"), -60, 0);
  await drag(page, page.locator(".layers-resize"), 0, -45);
  await drag(page, page.locator(".motion-resize"), 0, -40);
  const zoom = page.getByRole("slider", { name: "Zoom de la timeline", exact: true });
  await zoom.focus();
  await page.keyboard.press("End");
  await expect(zoom).toHaveAttribute("aria-valuenow", "640");
  await expect.poll(async () => (await stored(page, project.id))?.timelineZoom).toBe(640);
  const preferences = (await stored(page, project.id))!;
  expect(preferences.workspaceLayout).toBeDefined();
  expect(preferences.sidebarLayout).toBeDefined();
  expect(preferences.timelineHeight).toBeDefined();
  const changed = await geometry(page);
  expect(changed.sidebar).toBeGreaterThan(initial.sidebar + 40);
  expect(changed.timeline).toBeGreaterThan(initial.timeline + 30);
  expect(
    await page.evaluate(() => ({
      revision: window.musart!.snapshot().revision,
      renders: document.querySelector<HTMLElement>(".musart-app")!.dataset.reactRenders,
    })),
  ).toEqual(before);
  await page.reload();
  await page.waitForFunction((id) => window.musart?.snapshot().project.id === id, project.id);
  await expect(
    page.getByRole("slider", { name: "Zoom de la timeline", exact: true }),
  ).toHaveAttribute("aria-valuenow", "640");
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
  await expect
    .poll(async () => Math.abs((await geometry(page)).sidebar - changed.sidebar))
    .toBeLessThan(3);
  await expect
    .poll(async () => Math.abs((await geometry(page)).properties - changed.properties))
    .toBeLessThan(3);
  await expect
    .poll(async () => Math.abs((await geometry(page)).timeline - changed.timeline))
    .toBeLessThan(2);
  expect(await stored(page, project.id)).toEqual(preferences);
  await mkdir("artifacts/motion/ui", { recursive: true });
  await page.screenshot({ path: "artifacts/motion/ui/project-layout-restored.png" });
});

test("project B receives defaults and opening saved project A restores its own Motion preferences", async ({
  page,
}) => {
  const project = await ready(page);
  const height = Number(await page.locator(".motion-resize").getAttribute("aria-valuenow"));
  await page.locator(".motion-resize").focus();
  await page.keyboard.press("ArrowUp");
  const zoom = page.getByRole("slider", { name: "Zoom de la timeline", exact: true });
  await zoom.focus();
  await page.keyboard.press("End");
  await expect.poll(async () => (await stored(page, project.id))?.timelineZoom).toBe(640);
  const other = fixture("Layout project B");
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    await window.musart!.save();
  }, other);
  await expect(zoom).toHaveAttribute("aria-valuenow", "120");
  await expect(page.locator(".motion-resize")).toHaveAttribute("aria-valuenow", String(height));
  expect(await stored(page, other.id)).toBeUndefined();
  await page.getByRole("button", { name: "Menu du projet", exact: true }).click();
  await page
    .getByRole("article", { name: "Layout project A", exact: true })
    .getByRole("button", { name: "Layout project A", exact: true })
    .click();
  await page.waitForFunction((id) => window.musart?.snapshot().project.id === id, project.id);
  await expect(zoom).toHaveAttribute("aria-valuenow", "640");
  await expect(page.locator(".motion-resize")).toHaveAttribute(
    "aria-valuenow",
    String(height + 20),
  );
});
