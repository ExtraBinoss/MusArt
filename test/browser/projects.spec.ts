import { openProjectLibrary } from "./support/project-library";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { inspectImage } from "./support/image-probe";

async function ready(page: Page) {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator(".canvas-artboard canvas[data-renderer-ready=true]")).toBeVisible();
}
async function menu(page: Page, card: Locator, label: string) {
  await card.getByRole("button", { name: "Options du projet", exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function decoded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
    .toBe(true);
}

function projectA() {
  return createProject({
    id: "library-project-a",
    name: "Library A",
    pages: [
      createPage({
        id: "library-a-red",
        name: "Red page",
        width: 320,
        height: 220,
        layers: [
          createLayer("rectangle", {
            id: "library-red",
            name: "Red",
            x: 0,
            y: 0,
            width: 320,
            height: 220,
            fill: "#ff3344",
          }),
        ],
      }),
      createPage({
        id: "library-a-green",
        name: "Green page",
        width: 220,
        height: 320,
        layers: [
          createLayer("rectangle", {
            id: "library-green",
            name: "Green",
            x: 0,
            y: 0,
            width: 220,
            height: 320,
            fill: "#22bb66",
          }),
        ],
      }),
    ],
  });
}
function projectB() {
  return createProject({
    id: "library-project-b",
    name: "Library B",
    pages: [
      createPage({
        id: "library-b-blue",
        name: "Blue page",
        width: 240,
        height: 160,
        layers: [
          createLayer("rectangle", {
            id: "library-blue",
            x: 0,
            y: 0,
            width: 240,
            height: 160,
            fill: "#2563eb",
          }),
        ],
      }),
    ],
  });
}
async function populate(page: Page) {
  await page.evaluate(
    async ({ a, b }) => {
      const api = window.musart!;
      api.load(a);
      api.execute({ type: "updateLayers", ids: ["library-red"], patch: { fill: "#ee3344" } });
      api.execute({ type: "updateLayers", ids: ["library-red"], patch: { fill: "#ff3344" } });
      await api.save();
      await api.flushThumbnails();
      api.load(b);
      await api.save();
      await api.flushThumbnails();
    },
    { a: projectA(), b: projectB() },
  );
}

test("project cards use real overlay thumbnails and cycle only during unfocused hover", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await ready(page);
  await populate(page);
  await openProjectLibrary(page);
  const card = page.getByRole("article", { name: "Library A", exact: true }),
    preview = card.locator(".project-preview");
  const first = card.getByRole("img", { name: "Red page", exact: true });
  await decoded(first);
  await expect(first).toHaveAttribute("src", /^blob:/);
  const dimensions = await first.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  expect(dimensions.width).toBeGreaterThan(64);
  expect(dimensions.width / dimensions.height).toBeCloseTo(320 / 220, 1);
  const firstWitness = await inspectImage(page, await first.screenshot(), [
    { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
  ]);
  await page.bringToFront();
  const travelPending = preview.locator(".project-preview-track").evaluate(
    (element) =>
      new Promise<{ samples: number[]; width: number; timestamps: number[] }>((resolve, reject) => {
        const owner = element.closest<HTMLElement>(".project-preview")!,
          samples: number[] = [],
          timestamps: number[] = [];
        let frame = 0;
        const timer = setTimeout(() => {
          cancelAnimationFrame(frame);
          reject(new Error("The hovered project preview did not present five sliding frames."));
        }, 12000);
        function capture() {
          if (owner.dataset.previewSliding === "true") {
            samples.push(new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
            timestamps.push(performance.now());
          }
          if (samples.length === 5) {
            clearTimeout(timer);
            resolve({ samples, width: element.getBoundingClientRect().width, timestamps });
          } else frame = requestAnimationFrame(capture);
        }
        frame = requestAnimationFrame(capture);
        owner.dataset.previewMotionProbe = "armed";
      }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('[aria-label="Library A"] .project-preview')?.dataset
        .previewMotionProbe === "armed",
  );
  await preview.hover();
  await expect(preview).toHaveAttribute("data-preview-sliding", "true");
  const travel = await travelPending;
  expect(Math.min(...travel.samples)).toBeLessThan(-2);
  expect(new Set(travel.samples.map((value) => Math.round(value))).size).toBeGreaterThan(1);
  const second = card.getByRole("img", { name: "Green page", exact: true });
  await decoded(second);
  const secondWitness = await inspectImage(page, await second.screenshot(), [
    { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
  ]);
  expect(secondWitness.regions[0]!.hash).not.toBe(firstWitness.regions[0]!.hash);
  await page.bringToFront();
  await page.getByRole("heading", { name: "Vos projets", exact: true }).click();
  const paused = await preview.getAttribute("data-preview-page");
  await page.waitForTimeout(1700);
  await expect(preview).toHaveAttribute("data-preview-page", paused!);
  await card.getByRole("button", { name: "Ouvrir Library A", exact: true }).focus();
  await preview.hover();
  await page.waitForTimeout(1700);
  await expect(preview).toHaveAttribute("data-preview-page", paused!);
  await expect(card.locator(".preview-arrows, .preview-dots button")).toHaveCount(0);
  await expect(card.locator(".project-card-overlay .project-card-meta")).toBeVisible();
  await expect(card.locator(".preview-page-caption")).toContainText(/Red page|Green page/);
  await expect(page.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/project-library.png" });
  await testInfo.attach("real-page-previews", {
    body: JSON.stringify(
      { dimensions, travel, first: firstWitness.regions[0], second: secondWitness.regions[0] },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test("inactive CRUD, project storage, journal clearing, active clearing and creation stay coherent", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ready(page);
  await populate(page);
  await openProjectLibrary(page);
  const activeBefore = await page.evaluate(() => window.musart!.snapshot());
  let card = page.getByRole("article", { name: "Library A", exact: true });
  await expect(card).toBeVisible();
  await menu(page, card, "Renommer le projet");
  const rename = card.getByRole("textbox", { name: "Renommer le projet", exact: true });
  await expect(rename).toBeFocused();
  const renameHeight = (await rename.boundingBox())!.height;
  expect(renameHeight).toBe((await card.locator(".project-options-trigger").boundingBox())!.height);
  expect(renameHeight).toBe(28);
  await rename.fill("Library A renamed");
  await rename.press("Enter");
  card = page.getByRole("article", { name: "Library A renamed", exact: true });
  await expect(card).toBeVisible();
  expect((await page.evaluate(() => window.musart!.snapshot())).project.id).toBe(
    activeBefore.project.id,
  );
  const namesBefore = await page
    .getByRole("article")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  await menu(page, card, "Dupliquer");
  await expect.poll(() => page.getByRole("article").count()).toBe(namesBefore.length + 1);
  const namesAfter = await page
    .getByRole("article")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  const copyName = namesAfter.find((name) => name && !namesBefore.includes(name))!;
  const copy = page.getByRole("article", { name: copyName, exact: true });
  await expect(copy.getByRole("img")).toHaveCount(1);
  await decoded(copy.getByRole("img"));
  await menu(page, copy, "Supprimer");
  await page.getByRole("alertdialog").getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(copy).toBeVisible();
  await menu(page, copy, "Supprimer");
  await page.getByRole("button", { name: "Supprimer définitivement", exact: true }).click();
  await expect(copy).toHaveCount(0);
  await menu(page, card, "Stockage du projet");
  const storage = page.getByRole("dialog", { name: "Stockage du projet", exact: true });
  await expect(storage.getByText("Détail du journal")).toBeVisible();
  await expect(storage.getByText(/Tailles logiques JSON et UTF-8/)).toBeVisible();
  expect(await storage.locator(".project-storage-total strong").innerText()).not.toMatch(/^0\s/);
  await storage.getByRole("button", { name: "Effacer l’historique", exact: true }).click();
  await page.getByRole("button", { name: "Effacer le journal", exact: true }).click();
  await expect(storage.getByText(/0 entrées? enregistrée/)).toBeVisible();
  await expect(storage.getByRole("button", { name: "Effacer l’historique" })).toBeDisabled();
  await storage.getByRole("button", { name: "Fermer", exact: true }).click();
  expect((await page.evaluate(() => window.musart!.snapshot())).project.id).toBe(
    activeBefore.project.id,
  );
  await card.getByRole("button", { name: "Library A renamed", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Tableau de bord MusArt" })).toBeHidden();
  let state = await page.evaluate(() => window.musart!.snapshot());
  expect(state.project.id).toBe("library-project-a");
  expect(state.project.pages).toHaveLength(2);
  expect(state.project.pages[0]!.layers[0]!.fill).toBe("#ff3344");
  await page.evaluate(async () => {
    window.musart!.execute({ type: "updateLayers", ids: ["library-red"], patch: { x: 1 } });
    await window.musart!.flush();
  });
  await page.getByRole("tab", { name: "Animation", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Effacer l’historique", exact: true }),
  ).toBeEnabled();
  const canonical = await page.evaluate(() => window.musart!.snapshot());
  await page.getByRole("button", { name: "Effacer l’historique", exact: true }).click();
  await page.getByRole("button", { name: "Effacer le journal", exact: true }).click();
  await expect
    .poll(() => page.evaluate(async () => (await window.musart!.historyInfo()).events))
    .toBe(0);
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(canonical);
  await openProjectLibrary(page);
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill("Created through library");
  for (const [label, value] of [
    ["Largeur", "240"],
    ["Hauteur", "160"],
  ]) {
    const field = page.getByRole("textbox", { name: label, exact: true });
    await field.fill(value!);
    await field.press("Tab");
  }
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.name))
    .toBe("Created through library");
  state = await page.evaluate(() => window.musart!.snapshot());
  expect(state.project.pages[0]).toMatchObject({ width: 240, height: 160 });
});
