import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { inspectImage } from "./support/image-probe";
import { installReadbackProbe } from "./support/readback-probe";

async function presented(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.renderedRevision === canvas.dataset.sceneRevision
    );
  });
}

async function editor(page: Page) {
  return page.evaluate(() => {
    const snapshot = window.musart!.snapshot(),
      canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!;
    return {
      family: snapshot.project.pages[0]!.layers[0]!.fontFamily,
      revision: snapshot.revision,
      canUndo: snapshot.canUndo,
      instances: canvas.dataset.rendererInstances,
      commits: Object.fromEntries(
        [".musart-app", ".canvas-area", ".editor-canvas", ".editor-gpu-scene", ".inspector"].map(
          (selector) => {
            const value = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
            if (!value || Number(value) < 1) throw new Error(`Missing React counter: ${selector}`);
            return [selector, Number(value)];
          },
        ),
      ),
    };
  });
}

test("searchable font hover and keyboard previews change GPU text without editor commits, then apply once", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (document) => {
      window.musart!.load(document);
      window.musart!.select(["font-preview-text"]);
    },
    createProject({
      pages: [
        createPage({
          width: 640,
          height: 400,
          background: "#ffffff",
          layers: [
            createLayer("text", {
              id: "font-preview-text",
              x: 40,
              y: 110,
              width: 560,
              height: 150,
              text: "MusArt",
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: 96,
              fill: "#202125",
            }),
          ],
        }),
      ],
    }),
  );
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  await presented(page);
  await page.evaluate(() => window.musart!.flushThumbnails());
  const probe = await page.context().newPage();
  await page.bringToFront();
  async function hash() {
    const result = await inspectImage(
      page,
      await page.locator(".canvas-artboard canvas").screenshot(),
      [{ x: 0.05, y: 0.25, width: 0.9, height: 0.45 }],
      probe,
    );
    return result.regions[0]!.hash;
  }
  try {
    await page.getByRole("combobox", { name: "Police", exact: true }).click();
    const fonts = page.getByRole("listbox", { name: "Polices", exact: true });
    expect(await fonts.getByRole("option").count()).toBeLessThanOrEqual(10);
    expect(await fonts.getByRole("option").count()).toBeLessThan(20);
    const search = page.getByRole("combobox", { name: "Rechercher une police", exact: true });
    await expect(search).toBeFocused();
    await search.fill("Abel");
    await expect(page.getByRole("option", { name: "Abel", exact: true })).toBeVisible();
    await search.fill("");
    const baseline = await editor(page),
      initialHash = await hash();
    await search.fill("Tinos");
    await page.getByRole("option", { name: "Tinos", exact: true }).hover();
    await presented(page);
    const hover = await editor(page),
      hoverHash = await hash();
    expect(hover.commits).toEqual(baseline.commits);
    expect(hover.instances).toBe(baseline.instances);
    expect(hover.family).toBe("Inter");
    expect(hover.revision).toBe(baseline.revision);
    expect(hoverHash).not.toBe(initialHash);
    await search.press("Escape");
    await expect(fonts).toBeHidden();
    await presented(page);
    expect(await hash()).toBe(initialHash);
    expect((await editor(page)).canUndo).toBe(false);
    await page.getByRole("combobox", { name: "Police", exact: true }).click();
    await search.fill("Lora");
    const beforeKeyboard = await editor(page);
    await search.press("ArrowDown");
    await presented(page);
    const keyboard = await editor(page),
      keyboardHash = await hash();
    expect(keyboard.commits).toEqual(beforeKeyboard.commits);
    expect(keyboard.family).toBe("Inter");
    expect(keyboard.revision).toBe(baseline.revision);
    expect(keyboardHash).not.toBe(initialHash);
    await page.screenshot({ path: "artifacts/screenshots/font-picker-preview.png" });
    await search.press("Enter");
    await expect(fonts).toBeHidden();
    await presented(page);
    const committed = await editor(page);
    expect(committed.family).toBe("Lora");
    expect(committed.revision).toBe(baseline.revision + 1);
    expect(await hash()).toBe(keyboardHash);
    await page.evaluate(() => window.musart!.undo());
    await presented(page);
    expect((await editor(page)).family).toBe("Inter");
    expect((await editor(page)).canUndo).toBe(false);
    expect(await hash()).toBe(initialHash);
    await page.getByRole("combobox", { name: "Police", exact: true }).click();
    await expect(
      page
        .getByRole("group", { name: "Récentes" })
        .getByRole("button", { name: "Lora", exact: true }),
    ).toBeVisible();
    await search.press("Escape");
    const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
    expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    expect(errors).toEqual([]);
    await testInfo.attach("font-hover-preview", {
      contentType: "application/json",
      body: JSON.stringify(
        { baseline, hover, keyboard, committed, initialHash, hoverHash, keyboardHash, reads },
        null,
        2,
      ),
    });
  } finally {
    await probe.close();
  }
});

test("a real imported font stays available after saving and reopening the browser project", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (document) => {
      window.musart!.load(document);
      window.musart!.select(["font-import-text"]);
    },
    createProject({
      id: "font-import-project",
      pages: [
        createPage({
          width: 640,
          height: 400,
          background: "#ffffff",
          layers: [
            createLayer("text", {
              id: "font-import-text",
              text: "MusArt",
              x: 40,
              y: 110,
              width: 560,
              height: 150,
              fontSize: 96,
              fontWeight: 400,
              fontFamily: "Inter",
              fill: "#202125",
            }),
          ],
        }),
      ],
    }),
  );
  await presented(page);
  const probe = await page.context().newPage();
  await page.bringToFront();
  async function exportedHash() {
    const url = await page.evaluate(() => window.musart!.render({ scale: 1 }));
    const image = await inspectImage(
      page,
      url,
      [{ x: 0.05, y: 0.25, width: 0.9, height: 0.45 }],
      probe,
    );
    expect([image.width, image.height]).toEqual([640, 400]);
    return image.regions[0]!.hash;
  }
  try {
    const baseline = await exportedHash();
    await page.getByRole("combobox", { name: "Police", exact: true }).click();
    const chooseFile = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Importer une police", exact: true }).click();
    await (await chooseFile).setFiles("apps/web/public/fonts/tinos/font.ttf");
    await expect
      .poll(() =>
        page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.fontFamily),
      )
      .toMatch(/^custom:/);
    await expect(page.getByRole("listbox", { name: "Polices", exact: true })).toBeHidden();
    await presented(page);
    const family = await page.evaluate(
        () => window.musart!.snapshot().project.pages[0]!.layers[0]!.fontFamily,
      ),
      label = await page.getByRole("combobox", { name: "Police", exact: true }).innerText(),
      imported = await exportedHash();
    expect(label).toMatch(/Tinos/);
    expect(imported).not.toBe(baseline);
    await page.evaluate(() => window.musart!.save());
    await page.reload();
    await page.waitForFunction(() => Boolean(window.musart));
    await presented(page);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.fontFamily),
    ).toBe(family);
    await page.evaluate(() => window.musart!.select(["font-import-text"]));
    await expect(page.getByRole("combobox", { name: "Police", exact: true })).toContainText(
      "Tinos",
    );
    expect(await exportedHash()).toBe(imported);
    expect(await page.evaluate(() => window.__musartVideoReadbacks!)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
  } finally {
    await probe.close();
  }
});
