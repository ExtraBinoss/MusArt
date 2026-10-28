import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { MODEL_ID } from "../../apps/web/src/services/selection/model/manifest";

test("real local-model preparation reports bytes, preserves the document and supports removal without navigation", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(
    page.locator('[data-testid="artboard"] canvas[data-renderer-ready="true"]'),
  ).toBeVisible();
  const before = await page.evaluate(() => {
    document.documentElement.dataset.modelWitness = crypto.randomUUID();
    return {
      witness: document.documentElement.dataset.modelWitness,
      project: window.musart!.snapshot().project,
    };
  });
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.getByRole("button", { name: "Sélection d’objet", exact: true }).click();
  await expect(page.getByText("39,8 Mo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Préparer le modèle local", exact: true }).click();
  const progress = page.getByRole("progressbar", { name: "Téléchargement du modèle", exact: true });
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuetext", /Mo.*pour cent/);
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/model-download-progress.png" });
  const started = Date.now();
  await expect(page.getByRole("button", { name: "Modèle prêt", exact: true })).toBeDisabled({
    timeout: 120000,
  });
  await expect(page.getByText(/Sur cet appareil/)).toBeVisible();
  const ready = await page.evaluate(() => ({
    witness: document.documentElement.dataset.modelWitness,
    project: window.musart!.snapshot().project,
  }));
  expect(ready).toEqual(before);
  expect(navigations).toBe(0);
  const files = await page.evaluate(
    async (id) =>
      (await (await caches.open("transformers-cache")).keys())
        .map((item) => item.url)
        .filter((url) => url.includes(`/${id}/resolve/`)),
    MODEL_ID,
  );
  expect(files.length).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: "artifacts/screenshots/model-local-ready.png" });
  await page.getByRole("button", { name: "Supprimer le modèle téléchargé", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Préparer le modèle local", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      async (id) =>
        (await (await caches.open("transformers-cache")).keys()).filter((item) =>
          item.url.includes(`/${id}/resolve/`),
        ).length,
      MODEL_ID,
    ),
  ).toBe(0);
  expect(await page.evaluate(() => document.documentElement.dataset.modelWitness)).toBe(
    before.witness,
  );
  expect(navigations).toBe(0);
  await writeFile(
    "artifacts/model-management.json",
    JSON.stringify(
      {
        browser: page.context().browser()!.version(),
        prepareWallMs: Date.now() - started,
        modelFiles: files,
        navigations,
        projectUnchanged: true,
      },
      null,
      2,
    ),
  );
});
