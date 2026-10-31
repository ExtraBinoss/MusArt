import { unzipSync } from "fflate";
import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const folder = "artifacts/export-dialog";
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function prepare(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
  });
  await page.goto("/editor/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await mkdir(folder, { recursive: true });
}
async function choose(page: Page, name: string, label: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
function still() {
  const layer = createLayer("rectangle", {
    id: "selected",
    name: "Red artwork",
    x: 10,
    y: 8,
    width: 80,
    height: 60,
    fill: "#ff0000",
    strokeWidth: 0,
  });
  return createProject({
    name: "Print verification",
    pages: [
      createPage({ id: "print", name: "Print artwork", width: 120, height: 90, layers: [layer] }),
      createPage({
        id: "other",
        name: "Other artboard",
        width: 32,
        height: 20,
        background: "#00ff00",
      }),
    ],
  });
}
test("one dialog delivers selected sRGB PNG and an ICC CMYK PDF with actual print marks and page boxes", async ({
  page,
}) => {
  await prepare(page);
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["selected"]);
  }, still());
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  await expect(dialog).toBeVisible();
  const preview = dialog.getByRole("img", { name: "Aperçu de l’export", exact: true });
  await expect(preview).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const settings = element.querySelector(".export-settings-scroll")!.getBoundingClientRect();
    const preview = element.querySelector(".export-preview-pane")!.getBoundingClientRect();
    return {
      separate: settings.right <= preview.left + 1,
      sameTop: Math.abs(settings.top - preview.top) < 1,
    };
  });
  expect(geometry).toEqual({ separate: true, sameTop: true });
  const pngDone = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter l’image", exact: true }).click();
  const png = await pngDone;
  await png.saveAs(`${folder}/selection-srgb.png`);
  await expect(dialog.getByText("Export prêt.", { exact: true })).toBeVisible();
  const pngMeta = execFileSync(
    "identify",
    ["-format", "%wx%h %[colorspace]", `${folder}/selection-srgb.png`],
    { encoding: "utf8" },
  );
  expect(pngMeta).toBe("80x60 sRGB");
  await choose(page, "Couleurs de sortie", "CMJN · papier couché standard");
  await expect(dialog.getByRole("combobox", { name: "Format de fichier" })).toHaveText("PDF");
  await dialog.getByRole("button", { name: "Impression", exact: true }).click();
  const bleed = dialog.getByRole("textbox", { name: "Fond perdu (mm)" });
  await bleed.fill("3");
  await bleed.press("Enter");
  for (const name of [
    "Traits de coupe",
    "Repères de montage",
    "Barres de couleurs",
    "Nom du document et profil couleur",
  ])
    await dialog.getByRole("switch", { name, exact: true }).click();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await dialog.screenshot({ path: `${folder}/print-dialog.png` });
  const pdfDone = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter l’image", exact: true }).click();
  const pdf = await pdfDone;
  await pdf.saveAs(`${folder}/selection-cmyk.pdf`);
  const bytes = await readFile(`${folder}/selection-cmyk.pdf`),
    source = bytes.toString("latin1");
  expect(source).toContain("/N 4 /Alternate /DeviceCMYK");
  expect(source).toContain("/ColorSpace [/ICCBased 6 0 R]");
  expect(source).toContain("/TrimBox");
  expect(source).toContain("/BleedBox");
  expect(source).toContain("/Registration");
  expect(source).toContain("CGATS21 CRPC6");
  const info = execFileSync("pdfinfo", ["-box", `${folder}/selection-cmyk.pdf`], {
    encoding: "utf8",
  });
  expect(info).toMatch(/Creator:\s+Melt/);
  execFileSync("pdftoppm", [
    "-singlefile",
    "-r",
    "150",
    "-png",
    `${folder}/selection-cmyk.pdf`,
    `${folder}/decoded-cmyk`,
  ]);
  const pixel = execFileSync(
    "python3",
    [
      "-c",
      "from PIL import Image; import json; im=Image.open('artifacts/export-dialog/decoded-cmyk.png').convert('RGB'); print(json.dumps(im.getpixel((im.width//2, im.height//2))))",
    ],
    { encoding: "utf8" },
  );
  const [red, green, blue] = JSON.parse(pixel) as number[];
  expect(red).toBeGreaterThan(180);
  expect(green).toBeLessThan(100);
  expect(blue).toBeLessThan(100);
  for (const [format, extension] of [
    ["JPEG", "jpg"],
    ["TIFF", "tiff"],
  ] as const) {
    await choose(page, "Format de fichier", format);
    const done = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Exporter l’image", exact: true }).click();
    const delivery = await done;
    await delivery.saveAs(`${folder}/selection-cmyk.${extension}`);
    const description = execFileSync(
      "identify",
      ["-format", "%wx%h %[colorspace] %[profiles]", `${folder}/selection-cmyk.${extension}`],
      { encoding: "utf8" },
    );
    expect(description).toContain("80x60 CMYK");
    expect(description).toContain("icc");
  }
  const channels = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "from PIL import Image, ImageCms; import json; rgb=ImageCms.ImageCmsProfile('packages/render/assets/profiles/sRGB-v4.icc'); cmyk=ImageCms.ImageCmsProfile('packages/render/assets/profiles/CGATS21_CRPC6.icc'); ref=ImageCms.profileToProfile(Image.new('RGB',(1,1),(255,0,0)),rgb,cmyk,outputMode='CMYK',renderingIntent=0).getpixel((0,0)); out={}; exec(\"for ext in ['jpg','tiff']:\\n im=Image.open('artifacts/export-dialog/selection-cmyk.'+ext); out[ext]={'mode':im.mode,'actual':im.getpixel((im.width//2,im.height//2)),'expected':ref}\"); print(json.dumps(out))",
      ],
      { encoding: "utf8" },
    ),
  ) as Record<string, { mode: string; actual: number[]; expected: number[] }>;
  for (const [format, result] of Object.entries(channels)) {
    expect(result.mode).toBe("CMYK");
    result.actual.forEach((channel, index) =>
      expect(Math.abs(channel - result.expected[index]!)).toBeLessThanOrEqual(
        format === "tiff" ? 1 : 3,
      ),
    );
  }
  await choose(page, "Format de fichier", "PDF");
  await dialog.getByRole("button", { name: "Avancé", exact: true }).click();
  await dialog
    .getByRole("switch", { name: "Tous les plans de travail (.zip)", exact: true })
    .click();
  await expect(
    dialog.getByRole("switch", { name: "Plan de travail entier", exact: true }),
  ).toBeChecked();
  const zipDone = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter l’image", exact: true }).click();
  const archive = await zipDone;
  await archive.saveAs(`${folder}/all-artboards.zip`);
  const entries = unzipSync(new Uint8Array(await readFile(`${folder}/all-artboards.zip`)));
  expect(Object.keys(entries)).toHaveLength(2);
  for (const [name, data] of Object.entries(entries)) {
    expect(name).toMatch(/\.pdf$/);
    expect(new TextDecoder().decode(data)).toContain("/N 4 /Alternate /DeviceCMYK");
  }
  await dialog
    .getByRole("switch", { name: "Tous les plans de travail (.zip)", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog
      .locator(".export-footer-actions")
      .getByRole("button", { name: "Exporter l’image", exact: true }),
  ).toBeInViewport();
  await choose(page, "Couleurs de sortie", "CMJN · papier couché standard");
  await dialog.getByRole("button", { name: "Impression", exact: true }).click();
  await dialog.getByRole("switch", { name: "Traits de coupe", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Aperçu de l’export", exact: true })).toBeVisible();
  expect(
    await dialog
      .locator(".export-background-note")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(250);
  await dialog.screenshot({ path: `${folder}/print-dialog-mobile.png` });
  const mobileDone = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter l’image", exact: true }).click();
  await (await mobileDone).saveAs(`${folder}/mobile-cmyk.pdf`);

  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
});

test("motion and timelapse deliver decoded selected videos from the same settings and player layout", async ({
  page,
  context,
}) => {
  await prepare(page);
  const engine = new EditorEngine(still());
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 1, rate: 5 } });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["selected"]);
  }, engine.getSnapshot().project);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  await expect(dialog.locator(".motion-export-preview-surface canvas")).toBeVisible();
  const motionDone = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
  const motionFile = await motionDone,
    motionPath = `${folder}/selected-motion.${motionFile.suggestedFilename().split(".").at(-1)}`;
  await motionFile.saveAs(motionPath);
  await expect(dialog.getByText("Export prêt.", { exact: true })).toBeVisible();
  await dialog
    .locator(".export-footer-actions")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page.evaluate(async () => {
    window.musart!.execute({ type: "updateLayers", ids: ["selected"], patch: { x: 12 } });
    window.musart!.execute({ type: "updateLayers", ids: ["selected"], patch: { x: 14 } });
    await window.musart!.flush();
  });
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  await page.getByRole("button", { name: "Options d’export", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exporter un timelapse…", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Timelapse", exact: true });
  await expect(dialog.locator(".export-workspace")).toBeVisible();
  await expect(dialog.locator(".motion-export-preview-surface canvas")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Mettre l’aperçu en pause", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("spinbutton", { name: "Durée finale de la vidéo", exact: true }).fill("1");
  const timelapseDone = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
  const timelapseFile = await timelapseDone,
    timelapsePath = `${folder}/selected-timelapse.${timelapseFile.suggestedFilename().split(".").at(-1)}`;
  await timelapseFile.saveAs(timelapsePath);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  const inspection = await context.newPage();
  for (const [path, duration] of [
    [motionPath, 0.2],
    [timelapsePath, 1],
  ] as const) {
    const bytes = await readFile(path);
    const decoded = await inspection.evaluate(
      async ({ encoded, duration, mime }) => {
        const video = document.createElement("video");
        video.muted = true;
        video.src = `data:${mime};base64,${encoded}`;
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("Delivered video could not be decoded"));
        });
        await video.play();
        await new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve()));
        video.pause();
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0);
        const pixel = [
          ...ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1)
            .data,
        ];
        return {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          expected: duration,
          pixel,
        };
      },
      {
        encoded: bytes.toString("base64"),
        duration,
        mime: path.endsWith(".webm") ? "video/webm" : "video/mp4",
      },
    );
    expect(decoded.width).toBe(80);
    expect(decoded.height).toBe(60);
    expect(decoded.duration).toBeCloseTo(duration, 2);
    expect(decoded.pixel[0]).toBeGreaterThan(180);
    expect(decoded.pixel[1]).toBeLessThan(100);
    expect(decoded.pixel[2]).toBeLessThan(100);
  }
  await inspection.close();
});

test("motion preview and background export share the selected scope; progress, cancellation and leaving remain local", async ({
  page,
}) => {
  await prepare(page);
  const engine = new EditorEngine(still());
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 30, rate: 1 } });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["selected"]);
  }, engine.getSnapshot().project);
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  await expect(dialog.locator(".motion-export-preview-surface canvas")).toBeVisible();
  await expect
    .poll(() =>
      dialog
        .locator(".motion-export-preview-surface canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.width),
    )
    .toBe(80);
  await dialog.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await dialog
    .locator(".export-footer-actions")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Exporter", exact: true })).toContainText("%");
  await page.evaluate(() =>
    window.musart!.execute({ type: "renameProject", name: "Editing during export" }),
  );
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(dialog.getByText("Export annulé.", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Exporter la vidéo", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
  await dialog
    .locator(".export-footer-actions")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page.getByRole("button", { name: "Actions du projet", exact: true }).click();
  await page.getByRole("button", { name: "Projets", exact: true }).first().click();
  const leave = page.getByRole("alertdialog");
  await expect(leave).toHaveText(/Un export est en cours/);
  await leave.getByRole("button", { name: "Rester dans le projet", exact: true }).click();
  await expect(leave).not.toBeVisible();
  await page.getByRole("button", { name: "Actions du projet", exact: true }).click();
  await page.getByRole("button", { name: "Projets", exact: true }).first().click();
  await leave.getByRole("button", { name: "Annuler l’export et quitter", exact: true }).click();
  await expect(leave).not.toBeVisible();
  await expect(page.getByRole("dialog", { name: "Tableau de bord Melt" })).toBeVisible();
});
