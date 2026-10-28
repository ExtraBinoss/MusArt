import { expect, test, type Page } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";
import type { StoredProject } from "../../apps/web/src/services/projects/database";

async function savedState(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("musart-studio", 5);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const tx = db.transaction(["projects", "assets", "journalMeta", "preferences"]);
      const read = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [projects, assets, journals, last] = await Promise.all([
        read<StoredProject[]>(tx.objectStore("projects").getAll()),
        read(tx.objectStore("assets").count()),
        read(tx.objectStore("journalMeta").getAllKeys()),
        read<string | undefined>(tx.objectStore("preferences").get("last-project")),
      ]);
      return { projects, assets, journals, last };
    } finally {
      db.close();
    }
  });
}

test("first launch opens an empty shared dashboard; the visible techno template creates a real editable project", async ({
  page,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  const errors: string[] = [],
    deprecated: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/THREE\.Clock|PCFSoftShadowMap/.test(message.text())) deprecated.push(message.text());
  });
  await page.goto("/");
  const dashboard = page.getByRole("dialog", { name: "Tableau de bord MusArt", exact: true });
  await expect(dashboard).toBeVisible();
  await expect(dashboard.getByRole("tab")).toHaveCount(2);
  await expect(
    dashboard.getByRole("heading", { name: "Quel projet voulez-vous créer ?", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-artboard canvas")).toHaveCount(0);
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Escape");
  await expect(dashboard).toBeVisible();
  expect(await savedState(page)).toEqual({
    projects: [],
    assets: 0,
    journals: [],
    last: undefined,
  });
  await dashboard.getByRole("tab", { name: "Templates", exact: true }).click();
  const techno = dashboard.getByRole("button", {
    name: "Créer depuis AFTERHOURS — Techno",
    exact: true,
  });
  await expect(techno).toBeVisible();
  await expect
    .poll(() =>
      techno
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) =>
            image.complete && image.naturalWidth === 360 && image.naturalHeight === 640,
        ),
    )
    .toBe(true);
  await page.screenshot({ path: "artifacts/screenshots/dashboard-templates.png" });
  await techno.click();
  await expect(dashboard).toBeHidden();
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
  const action = await page.locator(".export-trigger").evaluate((button) =>
    getComputedStyle(button)
      .backgroundColor.match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number),
  );
  expect(action[2]! - action[0]!).toBeGreaterThan(50);
  const state = await savedState(page);
  expect(state.projects).toHaveLength(1);
  const project = state.projects[0]!.project;
  expect(project.name).toBe("AFTERHOURS — Techno");
  expect(project.pages).toHaveLength(1);
  expect(project.pages[0]!.layers).toHaveLength(150);
  expect(project.pages[0]!.layers.filter((layer) => layer.kind === "text").length).toBeGreaterThan(
    10,
  );
  expect(state.last).toBe(project.id);
  await expect.poll(async () => (await savedState(page)).journals).toEqual([project.id]);
  await page.getByRole("button", { name: "Actions du projet", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nom du projet", exact: true })).toHaveValue(
    "AFTERHOURS — Techno",
  );
  await expect(page.getByRole("button", { name: /Enregistrer/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Télécharger le projet .musart", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "artifacts/screenshots/afterhours-editor.png" });
  await page.reload();
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByRole("button", { name: "Actions du projet", exact: true })).toContainText(
    "AFTERHOURS",
  );
  await expect(dashboard).toBeHidden();
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
  expect(deprecated).toEqual([]);
});
