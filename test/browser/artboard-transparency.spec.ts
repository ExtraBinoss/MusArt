import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

async function ready(page: Page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
}
test("transparent artboards replace their backdrop after a real draw without leaving old artwork behind", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const first = createPage({
    id: "transparent-cover",
    width: 320,
    height: 200,
    background: "#00000000",
    layers: [
      createLayer("rectangle", {
        id: "red-card",
        x: 24,
        y: 24,
        width: 64,
        height: 64,
        fill: "#ff0000",
      }),
    ],
  });
  const other = createPage({
    id: "transparent-story",
    width: 320,
    height: 200,
    background: "#00000000",
  });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [first, other] }),
  );
  await ready(page);
  const backdrop = page.locator('.canvas-artboard-backdrop[data-artboard-id="transparent-cover"]');
  await expect(backdrop.locator("img")).toHaveCount(1);
  await expect(backdrop).toHaveAttribute("data-gpu-covered", "true");
  await expect(backdrop.locator("img")).toHaveCSS("visibility", "hidden");
  await page.evaluate(() =>
    window.musart!.execute({ type: "updateLayers", ids: ["red-card"], patch: { x: 216 } }),
  );
  await ready(page);
  await page.mouse.move(0, 0);
  const capture = await page
    .getByTestId("artboard")
    .screenshot({ path: "artifacts/screenshots/transparent-artboard-move.png" });
  const inspector = await page.context().newPage();
  try {
    const pixels = await inspector.evaluate(
      async (data) => {
        const image = new Image();
        image.src = data;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const at = (x: number, y: number) => [
          ...context.getImageData(
            Math.floor((x / 320) * image.width),
            Math.floor((y / 200) * image.height),
            1,
            1,
          ).data,
        ];
        return { old: at(48, 48), empty: at(112, 48), moved: at(240, 48) };
      },
      `data:image/png;base64,${capture.toString("base64")}`,
    );
    expect(pixels.moved[0]).toBeGreaterThan(240);
    expect(pixels.moved[1]).toBeLessThan(15);
    expect(pixels.old.slice(0, 3)).toEqual(pixels.empty.slice(0, 3));
  } finally {
    await inspector.close();
  }
  await page.evaluate(() => window.musart!.page("transparent-story"));
  await ready(page);
  await expect(backdrop.locator("img")).toHaveCSS("visibility", "visible");
  await page.evaluate(() => window.musart!.page("transparent-cover"));
  await ready(page);
  await expect(backdrop.locator("img")).toHaveCSS("visibility", "hidden");
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
