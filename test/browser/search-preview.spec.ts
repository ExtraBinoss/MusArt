import { expect, test } from "@playwright/test";

test("search hint artwork crossfades in place and survives typing without popping", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("./dashboard");
  const search = page.getByRole("searchbox").first();
  const previews = search.locator("..").locator("[data-search-previews]");
  await expect(previews).toBeVisible();
  const slots = previews.locator(":scope > span");
  expect(await slots.count()).toBeGreaterThan(1);
  const blend = await previews.evaluate(
    (root) =>
      new Promise<number[]>((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          setTimeout(
            () => resolve([...root.children].map((slot) => Number(getComputedStyle(slot).opacity))),
            90,
          );
        });
        observer.observe(root, {
          attributes: true,
          subtree: true,
          attributeFilter: ["data-active"],
        });
      }),
  );
  expect(blend.filter((opacity) => opacity > 0 && opacity < 1)).toHaveLength(2);
  expect(
    await slots.evaluateAll((nodes) => nodes.every((node) => !node.hasAttribute("hidden"))),
  ).toBe(true);
  const count = await slots.count();
  await search.fill("typed query");
  await expect(previews).toHaveAttribute("data-searching", "true");
  await expect.poll(() => previews.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  await expect(slots).toHaveCount(count);
  await search.fill("");
  await expect.poll(() => previews.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await page.screenshot({ path: "artifacts/search-preview.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await slots.first().evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration)),
  ).toBeLessThanOrEqual(0.00001);
});
