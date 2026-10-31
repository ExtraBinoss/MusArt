import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

test("storage links native hover/focus help and clears recorded steps without losing undo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "dark");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("./editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    async (project) => {
      const api = window.musart!;
      api.load(project);
      api.execute({ type: "updateLayers", ids: ["storage-shape"], patch: { x: 25 } });
      await api.save();
      await api.flush();
    },
    createProject({
      name: "Storage feedback",
      pages: [
        createPage({
          layers: [createLayer("rectangle", { id: "storage-shape", width: 100, height: 100 })],
        }),
      ],
    }),
  );
  const before = await page.evaluate(() => window.musart!.snapshot());
  expect(before.canUndo).toBe(true);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  const card = page.getByRole("article", { name: "Storage feedback", exact: true });
  await card.getByRole("button", { name: "Project options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Project storage", exact: true }).click();
  const storage = page.getByRole("dialog", { name: "Project storage", exact: true });
  const bar = storage.locator(".storage-distribution");
  const segment = bar.locator('[data-section="storedHistory"]');
  await segment.hover();
  await expect(page.getByRole("tooltip")).toContainText("History");
  await expect
    .poll(() =>
      bar.locator('[data-section="storedDocument"]').evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe("0.3");
  const row = storage.locator('.storage-row[data-section="storedDocument"]');
  await row.focus();
  await expect(page.getByRole("tooltip", { name: /^Document/ })).toContainText("Document");
  await expect(segment).toHaveAttribute("data-dimmed", "true");
  expect((await storage.boundingBox())!.height).toBeLessThan(360);
  await storage.getByRole("button", { name: "Recorded history", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Recorded history", exact: true });
  await expect(details).toContainText("Ctrl/Cmd+Z");
  await expect(
    details.getByRole("group", { name: "Recorded history storage breakdown" }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/storage-feedback.png" });
  await details.getByRole("button", { name: "Clear history", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("undo history are kept");
  await confirm.getByRole("button", { name: "Clear history", exact: true }).click();
  await expect(confirm).toBeHidden();
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
  await storage.getByRole("button", { name: "Recorded history", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Recorded history", exact: true })
      .getByRole("button", { name: "Clear history" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
