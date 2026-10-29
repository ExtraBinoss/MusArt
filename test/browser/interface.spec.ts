import { test, expect, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { fitViewport } from "./support/viewport";

async function ready(page: Page) {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function openPreferences(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: /Rechercher dans MusArt|Search MusArt/ })
    .fill("preferences");
  await page.getByRole("option", { name: /Préférences|Preferences/ }).click();
}
async function loadBlank(page: Page) {
  const document = createProject({
    name: "Studio test",
    pages: [createPage({ name: "Page test", width: 600, height: 500, background: "#f2f3f6" })],
  });
  await page.evaluate((document) => window.musart!.load(document), document);
  await expect(page.getByTestId("artboard")).toHaveCSS("width", "600px");
  await fitViewport(page);
}
async function snapshot(page: Page) {
  return page.evaluate(() => window.musart!.snapshot());
}

test("theme, language, persistent preferences and readable responsive panels", async ({ page }) => {
  await ready(page);
  await openPreferences(page);
  await page.getByRole("tab", { name: "Apparence", exact: true }).click();
  await page.getByRole("radio", { name: "Sombre", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("musart.theme"))).toBe("dark");
  await page.getByRole("tab", { name: "Général", exact: true }).click();
  await choose(page, "Langue", "English");
  await expect(page.getByRole("heading", { name: "Preferences", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/editor-dark.png" });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await openPreferences(page);
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByRole("radio", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await choose(page, "Language", "Français");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 650 });
  await fitViewport(page);
  await expect(page.getByRole("tree", { name: "Calques", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Propriétés", exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  expect(
    await page
      .locator(".brand-button")
      .evaluate((element) => getComputedStyle(element).getPropertyValue("backdrop-filter")),
  ).toContain("blur(20px)");
  await page.screenshot({ path: "artifacts/screenshots/editor-compact.png" });
});

test("drawing, moving and resizing commit exactly once to the same undo history", async ({
  page,
}) => {
  await ready(page);
  await loadBlank(page);
  await page.getByRole("button", { name: "Outil forme", exact: true }).click();
  const box = (await page.getByTestId("artboard").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65, { steps: 14 });
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).project.pages[0]!.layers.length).toBe(1);
  const created = (await snapshot(page)).project.pages[0]!.layers[0]!;
  expect(created.width).toBeGreaterThan(150);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect((await snapshot(page)).project.pages[0]!.layers).toHaveLength(0);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await page.getByRole("button", { name: "Sélection", exact: true }).click();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45, { steps: 12 });
  await page.mouse.up();
  const moved = (await snapshot(page)).project.pages[0]!.layers[0]!;
  expect(moved.x).not.toBe(created.x);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect((await snapshot(page)).project.pages[0]!.layers[0]).toEqual(created);
  const handle = page.getByRole("button", {
    name: `Redimensionner ${created.name} se`,
    exact: true,
  });
  const corner = (await handle.boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + 65, corner.y + 55, { steps: 12 });
  await page.mouse.up();
  expect((await snapshot(page)).project.pages[0]!.layers[0]!.width).toBeGreaterThan(created.width);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect((await snapshot(page)).project.pages[0]!.layers[0]).toEqual(created);
});

test("picker preview stays out of history, then one undo restores the committed color", async ({
  page,
}) => {
  await ready(page);
  const shape = createLayer("rectangle", {
    id: "paint-target",
    name: "Couleur test",
    x: 100,
    y: 100,
    width: 200,
    height: 180,
    fill: "#3366ff",
  });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["paint-target"]);
    },
    createProject({ pages: [createPage({ width: 600, height: 500, layers: [shape] })] }),
  );
  const picker = page.locator(".react-colorful__saturation .react-colorful__interactive");
  const area = (await picker.boundingBox())!;
  await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.7, area.y + area.height * 0.65, { steps: 12 });
  expect((await snapshot(page)).project.pages[0]!.layers[0]!.fill).toBe("#3366ff");
  expect((await snapshot(page)).canUndo).toBe(false);
  await page.mouse.up();
  await expect
    .poll(async () => (await snapshot(page)).project.pages[0]!.layers[0]!.fill)
    .not.toBe("#3366ff");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect((await snapshot(page)).project.pages[0]!.layers[0]!.fill).toBe("#3366ff");
  expect((await snapshot(page)).canUndo).toBe(false);
});

test("project rename, compositions, layer controls, reorder and panel splits operate through the UI", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "Actions du projet", exact: true }).click();
  const name = page.getByLabel("Nom du projet", { exact: true });
  await name.fill("Atelier personnel");
  await name.press("Enter");
  await expect.poll(async () => (await snapshot(page)).project.name).toBe("Atelier personnel");
  await name.fill("Annulé");
  await name.press("Escape");
  expect((await snapshot(page)).project.name).toBe("Atelier personnel");
  const initialPages = (await snapshot(page)).project.pages.length;
  await page.locator('.artboard-heading[data-active="true"]').hover();
  await page.getByTestId("canvas-add-artboard").click();
  expect((await snapshot(page)).project.pages).toHaveLength(initialPages + 1);
  const addedPage = (await snapshot(page)).project.pages.at(-1)!;
  await page
    .getByRole("button", { name: `Options du plan de travail : ${addedPage.name}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Supprimer", exact: true }).click();
  expect((await snapshot(page)).project.pages).toHaveLength(initialPages);
  const pageState = (await snapshot(page)).project.pages[0]!;
  await page
    .locator(`.artboard-heading[data-artboard-id="${pageState.id}"] .artboard-name`)
    .click();
  const first = pageState.layers.at(-1)!;
  await page.getByText(first.name, { exact: true }).click();
  await page
    .getByRole("button", { name: `Verrouiller le calque · ${first.name}`, exact: true })
    .click();
  expect(
    (await snapshot(page)).project.pages[0]!.layers.find((layer) => layer.id === first.id)!.locked,
  ).toBe(true);
  await page
    .getByRole("button", { name: `Déverrouiller le calque · ${first.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: `Masquer le calque · ${first.name}`, exact: true })
    .click();
  expect(
    (await snapshot(page)).project.pages[0]!.layers.find((layer) => layer.id === first.id)!.visible,
  ).toBe(false);
  await page
    .getByRole("button", { name: `Afficher le calque · ${first.name}`, exact: true })
    .click();
  const second = pageState.layers.at(-2)!;
  const source = page
    .getByRole("treeitem")
    .filter({ has: page.locator(".layer-name", { hasText: first.name }) });
  const target = page
    .getByRole("treeitem")
    .filter({ has: page.locator(".layer-name", { hasText: second.name }) });
  const targetBox = (await target.boundingBox())!;
  await source.dragTo(target, { targetPosition: { x: 30, y: targetBox.height - 4 } });
  await expect
    .poll(async () =>
      (await snapshot(page)).project.pages[0]!.layers.findIndex((layer) => layer.id === first.id),
    )
    .not.toBe(pageState.layers.length - 1);
  const sidebar = page.locator(".sidebar");
  const widthBefore = (await sidebar.boundingBox())!.width;
  const splitter = page
    .getByRole("separator", { name: "Redimensionner les panneaux", exact: true })
    .first();
  await splitter.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(widthBefore);
  const lowerSplit = page
    .getByRole("separator", { name: "Redimensionner les panneaux", exact: true })
    .last();
  const inspectorHeight = (await page
    .getByRole("region", { name: "Propriétés", exact: true })
    .boundingBox())!.height;
  await lowerSplit.focus();
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(
      async () =>
        (await page.getByRole("region", { name: "Propriétés", exact: true }).boundingBox())!.height,
    )
    .toBeLessThan(inspectorHeight);
});

test("effect controls follow the shared catalogue and reorder the stack without losing parameters", async ({
  page,
}) => {
  await ready(page);
  const shape = createLayer("rectangle", {
    id: "effect-target",
    name: "Effets",
    x: 90,
    y: 90,
    width: 240,
    height: 220,
    fill: "#8899bb",
  });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["effect-target"]);
    },
    createProject({
      name: "Effets locaux",
      pages: [createPage({ width: 600, height: 500, layers: [shape] })],
    }),
  );
  for (const [name, category] of [
    ["Dither", "Ajouter un effet"],
    ["ASCII", "Ajouter un effet"],
    ["Contraste", "Ajouter un réglage"],
  ]) {
    await page.getByRole("button", { name: category, exact: true }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  }
  const effectRow = page.locator('.layer-row[data-layer-id="effect-target"]');
  await effectRow.locator(".group-chevron").click();
  const ditherId = (await snapshot(page)).project.pages[0]!.layers[0]!.effects[0]!.id;
  const ditherTrigger = page.locator(
    `.layer-attachment-row[data-effect-id="${ditherId}"] .attachment-name`,
  );
  await ditherTrigger.click();
  const dither = page.getByRole("dialog", { name: "Effets · Effets", exact: true });
  const amount = dither.getByRole("textbox", { name: "Intensité", exact: true });
  await amount.fill("65");
  await amount.press("Tab");
  await expect
    .poll(async () => (await snapshot(page)).project.pages[0]!.layers[0]!.effects[0]!.amount)
    .toBe(0.65);
  await dither.getByRole("switch", { name: "Couleur", exact: true }).click();
  const before = (await snapshot(page)).project.pages[0]!.layers[0]!.effects;
  expect(before.map((effect) => effect.type)).toEqual(["dither", "ascii", "contrast"]);
  await page.keyboard.press("Escape");
  await expect(dither).toHaveCount(0);
  await expect(ditherTrigger).toBeFocused();
  await page
    .locator(`.layer-attachment-row[data-effect-id="${before[1]!.id}"]`)
    .dragTo(page.locator(`.layer-attachment-row[data-effect-id="${before[0]!.id}"]`));
  expect((await snapshot(page)).project.pages[0]!.layers[0]!.effects).toEqual([
    before[1],
    before[0],
    before[2],
  ]);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect((await snapshot(page)).project.pages[0]!.layers[0]!.effects).toEqual(before);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/editor-effects.png" });
});

test("scrub properties preview outside React, cancel cleanly and commit a single undo step", async ({
  page,
}) => {
  await ready(page);
  const layer = createLayer("rectangle", {
    id: "scrub-target",
    name: "Scrub target",
    x: 80,
    y: 80,
    width: 260,
    height: 200,
    fill: "#2563eb",
  });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["scrub-target"]);
    },
    createProject({ pages: [createPage({ width: 600, height: 500, layers: [layer] })] }),
  );
  const handle = page.getByRole("button", { name: "Ajuster Opacité", exact: true });
  await handle.scrollIntoViewIfNeeded();
  const surfaces = [
    ".musart-app",
    ".inspector",
    ".canvas-area",
    ".editor-canvas",
    ".editor-gpu-scene",
  ];
  const counts = () =>
    page.evaluate(
      (selectors) =>
        selectors.map(
          (selector) => document.querySelector<HTMLElement>(selector)!.dataset.reactRenders,
        ),
      surfaces,
    );
  const before = await counts(),
    box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (const distance of [20, 40, 60])
    await page.mouse.move(box.x + box.width / 2 - distance, box.y + box.height / 2);
  await expect
    .poll(() => page.getByRole("textbox", { name: "Opacité", exact: true }).inputValue())
    .toBe("88");
  expect(await counts()).toEqual(before);
  expect((await snapshot(page)).project.pages[0]!.layers[0]!.opacity).toBe(1);
  expect((await snapshot(page)).canUndo).toBe(false);
  await handle.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await expect(page.getByRole("textbox", { name: "Opacité", exact: true })).toHaveValue("100");
  expect((await snapshot(page)).canUndo).toBe(false);
  const current = (await handle.boundingBox())!;
  await page.mouse.move(current.x + current.width / 2, current.y + current.height / 2);
  await page.mouse.down();
  await page.mouse.move(current.x + current.width / 2 - 50, current.y + current.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  expect((await snapshot(page)).project.pages[0]!.layers[0]!.opacity).toBe(0.9);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect((await snapshot(page)).project.pages[0]!.layers[0]!.opacity).toBe(1);
  expect((await snapshot(page)).canUndo).toBe(false);
});

test("the searchable shape library, linked masks and design/animate tabs are usable", async ({
  page,
}) => {
  await ready(page);
  await loadBlank(page);
  await page.getByRole("button", { name: "Ouvrir la bibliothèque de formes", exact: true }).click();
  const query = page.getByRole("searchbox", { name: "Rechercher" });
  await query.fill("cœur");
  await expect(page.getByRole("button", { name: "Utiliser Cœur", exact: true })).toBeVisible();
  await query.press("Enter");
  await expect(query).toBeHidden();
  const artboard = (await page.getByTestId("artboard").boundingBox())!;
  await page.mouse.move(artboard.x + artboard.width * 0.3, artboard.y + artboard.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(artboard.x + artboard.width * 0.65, artboard.y + artboard.height * 0.65, {
    steps: 8,
  });
  await page.mouse.up();
  const vector = (await snapshot(page)).project.pages[0]!.layers[0]!;
  expect(vector.kind).toBe("vector");
  expect(vector.vector?.path || vector.vector?.parts?.length).toBeTruthy();
  await page.getByRole("button", { name: "Outil forme", exact: true }).click({ button: "right" });
  await expect(page.getByRole("searchbox")).toBeVisible();
  await page.keyboard.press("Escape");
  const mask = createLayer("rectangle", {
    id: "mask-shape",
    name: "Mask source",
    width: 120,
    height: 120,
  });
  const content = createLayer("rectangle", {
    id: "content-shape",
    name: "Content",
    width: 240,
    height: 180,
  });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["mask-shape", "content-shape"]);
    },
    createProject({ pages: [createPage({ width: 600, height: 500, layers: [mask, content] })] }),
  );
  await page.getByRole("button", { name: "Actions des calques", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Créer un masque avec la sélection", exact: true })
    .click();
  expect(
    (await snapshot(page)).project.pages[0]!.layers.find((layer) => layer.id === "content-shape")!
      .mask?.layerId,
  ).toBe("mask-shape");
  await page
    .getByRole("treeitem")
    .filter({ has: page.locator(".layer-name", { hasText: /^Content$/ }) })
    .click();
  const maskTrigger = page.locator(
    '.layer-row[data-layer-id="content-shape"] [data-attachment-target="mask"]',
  );
  await maskTrigger.click();
  const maskPopover = page.getByRole("dialog", { name: "Masque · Content", exact: true });
  await choose(page, "Mode du masque", "Luminosité");
  await page.getByRole("button", { name: "Inverser le masque", exact: true }).click();
  expect(
    (await snapshot(page)).project.pages[0]!.layers.find((layer) => layer.id === "content-shape")!
      .mask,
  ).toMatchObject({ mode: "luminance", inverted: true });
  await page.keyboard.press("Escape");
  await expect(maskPopover).toHaveCount(0);
  await expect(maskTrigger).toBeFocused();
  await page.getByRole("tab", { name: "Animation", exact: true }).click();
  await expect(page.getByRole("region", { name: "Rejouer la création" })).toBeVisible();
  await page.getByRole("tab", { name: "Design", exact: true }).click();
  await expect(page.getByRole("region", { name: "Propriétés" })).toBeVisible();
});
