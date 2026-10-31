import { expect, test } from "@playwright/test";
import { createProject, createPage } from "@musart/core";

test("Try Melt opens templates without importing the editor; projects expose one open action and both menus", async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("./");
  const cta = page.getByRole("button", { name: "Try Melt", exact: true });
  await expect(cta).toBeVisible();
  expect(await cta.evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Clash Display");
  await expect(page.getByRole("link", { name: "Open editor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
  await expect(page.getByText("No account. Your projects stay with you.")).toHaveCount(0);
  await page.evaluate(() => {
    const timing = window as unknown as { libraryStart: number; libraryEntryMs: number };
    document.querySelector(".landing-try")!.addEventListener(
      "pointerdown",
      () => {
        timing.libraryStart = performance.now();
      },
      { once: true },
    );
    const observer = new MutationObserver(() => {
      if (
        !timing.libraryStart ||
        !document.querySelector(".project-dashboard .template-card-entry")
      )
        return;
      observer.disconnect();
      requestAnimationFrame(() => {
        timing.libraryEntryMs = performance.now() - timing.libraryStart;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await cta.click();
  await expect(page.locator(".project-dashboard")).toBeVisible();
  await expect(page.locator('.library-navigation-item[aria-current="page"]')).toHaveText(
    "Templates",
  );
  expect(requests.some((url) => /\/App\.tsx|\/App-[^/]+\.js|\/EditorCanvas/.test(url))).toBe(false);
  await page.waitForFunction(
    () => (window as unknown as { libraryEntryMs: number }).libraryEntryMs > 0,
  );
  console.log(
    "Try Melt → first template frame (ms):",
    await page.evaluate(() => (window as unknown as { libraryEntryMs: number }).libraryEntryMs),
  );
  const nav = page.locator(".library-navigation .library-navigation-item");
  expect(await nav.allTextContents()).toEqual(["Templates", "Projects", "CommunitySoon"]);
  await expect(page.getByText("Your favorites will appear here.")).toHaveCount(0);
  const search = page.getByRole("searchbox");
  const input = await (
    (await search.count()) ? search : page.getByRole("textbox", { name: "Search templates" })
  ).boundingBox();
  const filter = await page.getByRole("radiogroup").boundingBox();
  expect(Math.abs(input!.height - filter!.height)).toBeLessThanOrEqual(1);
  // Install a favorite without a separate favorites rail.
  const tile = page.locator(".template-card-entry").nth(2),
    title = (await tile.locator(".template-title").textContent())!.trim();
  await tile.locator(".template-card").click();
  await page.getByRole("button", { name: "Add to favorites", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove from favorites", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(
    page.locator(".template-card-entry").first().locator(".template-title"),
  ).toContainText(title);
  await expect(
    page.locator(".template-card-entry").first().locator(".library-favorite-badge"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".template-card-entry").first().locator(".library-favorite-badge"),
  ).toBeVisible();
  // Saved project actions preserve the dedicated direct-open target.
  await page.goto("./editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    async (project) => {
      window.musart!.load(project);
      await window.musart!.save();
    },
    createProject({ name: "Library menu test", pages: [createPage({ layers: [] })] }),
  );
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  const card = page.getByRole("article", { name: "Library menu test", exact: true });
  await expect(card).toBeVisible();
  await expect(card.locator(".library-item-open")).toHaveCount(1);
  const open = await card.locator(".library-item-open").boundingBox(),
    options = await card.locator(".project-options-trigger").boundingBox();
  expect(options!.y).toBeGreaterThan(open!.y + open!.height);
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename project", exact: true }).click();
  const rename = card.getByRole("textbox", { name: "Rename project" });
  await rename.fill("Renamed from context");
  await rename.press("Enter");
  await expect(
    page.getByRole("article", { name: "Renamed from context", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
