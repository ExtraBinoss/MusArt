import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

test("Three/Fiber startup and demand updates produce no browser warnings or errors", async ({
  page,
}) => {
  const messages: { type: string; text: string }[] = [],
    errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error")
      messages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [
        createPage({
          width: 320,
          height: 240,
          layers: [createLayer("rectangle", { id: "console-witness", width: 120, height: 80 })],
        }),
      ],
    }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')?.dataset
        .rendererReady === "true",
  );
  const before = await page
    .locator('[data-testid="artboard"] canvas')
    .evaluate((element) => Number((element as HTMLCanvasElement).dataset.renderCount));
  await page.evaluate(() =>
    window.musart!.execute({
      type: "updateLayers",
      ids: ["console-witness"],
      patch: { width: 160 },
    }),
  );
  await page.waitForFunction((before) => {
    const data = document.querySelector<HTMLCanvasElement>(
      '[data-testid="artboard"] canvas',
    )?.dataset;
    return data?.rendererReady === "true" && Number(data.renderCount) > before;
  }, before);
  expect(messages).toEqual([]);
  expect(errors).toEqual([]);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/runtime-console.json",
    JSON.stringify(
      { browser: page.context().browser()!.version(), messages, errors, reads },
      null,
      2,
    ),
  );
});
