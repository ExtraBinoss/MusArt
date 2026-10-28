import { expect, test, type Locator } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { inspectImage } from "./support/image-probe";
import { installReadbackProbe } from "./support/readback-probe";

async function expectSquareActions(buttons: Locator, edge: number, padding: number) {
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  await expect
    .poll(() =>
      buttons.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect(),
            style = getComputedStyle(node);
          return [
            Math.round(box.width),
            Math.round(box.height),
            ...[style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(
              Number.parseFloat,
            ),
          ];
        }),
      ),
    )
    .toEqual(Array.from({ length: count }, () => [edge, edge, padding, padding, padding, padding]));
}

test("layer actions have symmetrical square hit areas and dither opacity keeps its Sun scrub label", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["spacing-layer"]);
    },
    createProject({
      pages: [
        createPage({
          width: 400,
          height: 400,
          layers: [
            createLayer("rectangle", {
              id: "spacing-layer",
              name: "Dither target",
              width: 180,
              height: 180,
              effects: [createEffect("dither")],
            }),
          ],
        }),
      ],
    }),
  );
  const layers = page.getByRole("region", { name: "Calques", exact: true }),
    row = layers.locator('[data-layer-id="spacing-layer"]'),
    footer = layers.getByRole("group", { name: "Actions des calques", exact: true });
  await expect(
    footer.getByRole("group", { name: "Ajouter des effets et corrections", exact: true }),
  ).toBeVisible();
  await expect(
    footer.getByRole("group", { name: "Actions de la sélection", exact: true }),
  ).toBeVisible();
  await expectSquareActions(footer.locator(".icon-button"), 30, 7);
  await row.hover();
  await expectSquareActions(row.locator(".layer-actions .icon-button"), 28, 6);
  await expectSquareActions(row.locator(".attachment-thumbnail-card"), 30, 3);
  await row.locator('[data-attachment-target="effect"]').click();
  const popover = page.getByRole("dialog", { name: "Effets · Dither target", exact: true });
  await expect(
    popover.getByRole("button", { name: "Ajuster Opacité", exact: true }).locator("svg.lucide-sun"),
  ).toHaveAttribute("aria-hidden", "true");
  await expectSquareActions(popover.locator(".attachment-actions .icon-button"), 30, 7);
  const revision = await page.evaluate(() => window.musart!.snapshot().revision),
    opacity = popover.getByRole("textbox", { name: "Opacité", exact: true });
  await opacity.fill("37");
  await opacity.press("Enter");
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.opacity,
    ),
  ).toBe(0.37);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
  await page.screenshot({ path: "artifacts/screenshots/layer-action-spacing.png" });
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.opacity ?? 1,
    ),
  ).toBe(1);
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("layer compositing, nested FX/mask children and context grouping preserve canonical undo", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const first = createEffect("brightness", { id: "fx-brightness", amount: 0.3 }),
    second = createEffect("contrast", { id: "fx-contrast", amount: 0.2 });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["a", "b"]);
    },
    createProject({
      pages: [
        createPage({
          width: 400,
          height: 400,
          layers: [
            createLayer("rectangle", {
              id: "a",
              name: "Foreground",
              x: 30,
              y: 40,
              width: 150,
              height: 150,
              fill: "#3d83ad",
              effects: [first, second],
              mask: { layerId: "mask", mode: "alpha", inverted: false, enabled: true },
            }),
            createLayer("ellipse", {
              id: "b",
              name: "Accent",
              x: 150,
              y: 150,
              width: 160,
              height: 160,
              opacity: 0.4,
            }),
            createLayer("rectangle", {
              id: "mask",
              name: "Mask source",
              width: 400,
              height: 400,
              fill: "#ffffff",
              maskSource: true,
            }),
          ],
        }),
      ],
    }),
  );
  const layers = page.getByRole("region", { name: "Calques", exact: true });
  const inspector = page.getByRole("region", { name: "Propriétés", exact: true });
  await expect(inspector.getByRole("textbox", { name: "Opacité", exact: true })).toHaveCount(0);
  await expect(inspector.getByRole("combobox", { name: "Fusion", exact: true })).toHaveCount(0);
  await expect(layers.getByRole("textbox", { name: "Opacité", exact: true })).toHaveAttribute(
    "placeholder",
    "Mixte",
  );
  await layers.getByRole("textbox", { name: "Opacité", exact: true }).fill("55");
  await layers.getByRole("textbox", { name: "Opacité", exact: true }).press("Enter");
  const opacity = () =>
    page.evaluate(() =>
      window
        .musart!.snapshot()
        .project.pages[0]!.layers.slice(0, 2)
        .map((layer) => layer.opacity),
    );
  expect(await opacity()).toEqual([0.55, 0.55]);
  await page.evaluate(() => window.musart!.undo());
  expect(await opacity()).toEqual([1, 0.4]);
  expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
  await page.evaluate(() => window.musart!.select(["a"]));
  const row = layers.locator('[data-layer-id="a"]');
  await row.getByRole("button", { name: "Foreground", exact: true }).click();
  const children = layers.locator("[data-effect-id], [data-mask-for]");
  await expect(children).toHaveCount(3);
  await expect(children.nth(0)).toHaveAttribute("data-effect-id", first.id);
  await expect(children.nth(1)).toHaveAttribute("data-effect-id", second.id);
  await expect(children.nth(2)).toHaveText(/Mask source/);
  await layers
    .locator(`[data-effect-id="${second.id}"]`)
    .dragTo(layers.locator(`[data-effect-id="${first.id}"]`));
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.musart!.snapshot().project.pages[0]!.layers[0]!.effects.map((effect) => effect.id),
      ),
    )
    .toEqual([second.id, first.id]);
  await page.evaluate(() => window.musart!.undo());
  await row.getByRole("button", { name: "Masque · Foreground", exact: true }).click();
  await page.getByRole("button", { name: "Inverser le masque", exact: true }).click();
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.mask!.inverted,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.musart!.undo();
    window.musart!.select(["a", "b"]);
  });
  await row.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "Grouper la sélection", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Supprimer la sélection (2)", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Grouper la sélection", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.layers.filter((layer) => layer.kind === "group")
          .length,
    ),
  ).toBe(1);
  await page.screenshot({ path: "artifacts/screenshots/layer-attachments-context.png" });
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, canvasHook: true });
});

test("native blend previews change pixels for a multiselection, cancel exactly and commit one undo", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["back", "front"]);
    },
    createProject({
      pages: [
        createPage({
          width: 300,
          height: 200,
          layers: [
            createLayer("rectangle", {
              id: "back",
              x: 0,
              y: 0,
              width: 300,
              height: 200,
              fill: "#f18b44",
            }),
            createLayer("rectangle", {
              id: "front",
              x: 100,
              y: 50,
              width: 100,
              height: 100,
              fill: "#4176dc",
            }),
          ],
        }),
      ],
    }),
  );
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  const canvas = page.locator(".canvas-artboard canvas");
  async function presented(after = -1) {
    await page.waitForFunction((after) => {
      const c = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
      return (
        c?.dataset.rendererReady === "true" &&
        c.dataset.sceneRevision === c.dataset.renderedRevision &&
        Number(c.dataset.renderCount) > after
      );
    }, after);
  }
  await presented();
  await page.evaluate(() => window.musart!.flushThumbnails());
  const probe = await page.context().newPage();
  await page.bringToFront();
  async function hash() {
    return (
      await inspectImage(
        page,
        await canvas.screenshot(),
        [{ x: 0.35, y: 0.3, width: 0.25, height: 0.35 }],
        probe,
      )
    ).regions[0]!.hash;
  }
  const counters = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [".musart-app", ".canvas-area", ".editor-canvas", ".editor-gpu-scene", ".inspector"].map(
          (selector) => [
            selector,
            document.querySelector<HTMLElement>(selector)!.dataset.reactRenders,
          ],
        ),
      ),
    );
  const frames = () =>
    canvas.evaluate((element) => Number((element as HTMLCanvasElement).dataset.renderCount));
  try {
    const original = await hash(),
      before = await counters();
    // Radix hides the trigger from the accessibility tree while its modal listbox is open.
    const blend = page.locator(
      '.layer-compositing [data-slot="select-trigger"][aria-label="Fusion"]',
    );
    await blend.click();
    await expect(blend).toHaveAttribute("data-state", "open");
    await expect
      .poll(() =>
        blend
          .locator('[data-slot="select-chevron"]')
          .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a),
      )
      .toBeCloseTo(-1, 2);
    const prior = await frames();
    await page.getByRole("option", { name: "Produit", exact: true }).hover();
    await presented(prior);
    expect(await hash()).not.toBe(original);
    expect(await counters()).toEqual(before);
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    expect(
      await page.evaluate(() =>
        window.musart!.snapshot().project.pages[0]!.layers.map((layer) => layer.blendMode),
      ),
    ).toEqual(["normal", "normal"]);
    const held = await frames();
    await page.keyboard.press("Escape");
    await presented(held);
    expect(await hash()).toBe(original);
    expect(await counters()).toEqual(before);
    await blend.click();
    await page.getByRole("option", { name: "Produit", exact: true }).hover();
    await page.getByRole("option", { name: "Produit", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.musart!.snapshot().project.pages[0]!.layers.map((layer) => layer.blendMode),
        ),
      )
      .toEqual(["multiply", "multiply"]);
    await page.evaluate(() => window.musart!.undo());
    await presented();
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    expect(await hash()).toBe(original);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
  } finally {
    await probe.close();
  }
});
