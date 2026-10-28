import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";

test("custom toolbar shortcuts unpin through right-click and keyboard menus, persisting without document edits", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    if (!localStorage.getItem("musart.dock.commands"))
      localStorage.setItem("musart.dock.commands", '["action:addPage","action:delete"]');
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ name: "Unpin witness", width: 320, height: 240 })] }),
  );
  const addPage = page.locator('.dock-pinned [data-dock-command="action:addPage"]');
  const deleteCommand = page.locator('.dock-pinned [data-dock-command="action:delete"]');
  const builtins = page.locator(".toolbar .tool-button");
  const builtinCount = await builtins.count();
  const before = await page.evaluate(() => window.musart!.snapshot());
  await addPage.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /^Désépingler / })).toBeVisible();
  await expect(page.locator(".dock-customizer")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/screenshots/dock-unpin-context-menu.png" });
  await page.keyboard.press("Escape");
  await expect(addPage).toBeVisible();
  await addPage.click({ button: "right" });
  await page.getByRole("menuitem", { name: /^Désépingler / }).click();
  await expect(addPage).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("musart.dock.commands")!)))
    .toEqual(["action:delete"]);
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
  await expect(builtins).toHaveCount(builtinCount);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(addPage).toHaveCount(0);
  await expect(deleteCommand.locator("button")).toBeDisabled();
  await deleteCommand.focus();
  await page.keyboard.press("Shift+F10");
  const unpin = page.getByRole("menuitem", { name: /^Désépingler / });
  await expect(unpin).toBeVisible();
  await unpin.press("Enter");
  await expect(deleteCommand).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("musart.dock.commands")!)))
    .toEqual([]);
  await expect(page.locator(".dock-pinned")).toBeFocused();
  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator(".dock-pinned [data-dock-command]")).toHaveCount(0);
  await expect(builtins).toHaveCount(builtinCount);
  expect(errors).toEqual([]);
});
