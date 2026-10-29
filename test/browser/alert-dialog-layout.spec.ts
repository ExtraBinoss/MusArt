import { expect, test } from "@playwright/test";

test("real app CSS scopes alert media title alignment to default dialogs at 40rem", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 800 });
  await page.goto("/");
  // Genuine Radix structure has its component test. This fixture isolates native
  // computed CSS under the shipped stylesheet; it makes no GPU rendering claim.
  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.id = "alert-dialog-layout-fixture";
    for (const [name, size, withMedia] of [
      ["default-media", "default", true],
      ["small-media", "sm", true],
      ["default-no-media", "default", false],
      ["small-no-media", "sm", false],
    ] as const) {
      const content = document.createElement("section");
      content.dataset.slot = "alert-dialog-content";
      content.dataset.size = size;
      content.className = "group/alert-dialog-content";
      const header = document.createElement("header");
      header.dataset.slot = "alert-dialog-header";
      header.className = "grid";
      if (withMedia) {
        const media = document.createElement("div");
        media.dataset.slot = "alert-dialog-media";
        media.textContent = "Media";
        header.append(media);
      }
      const title = document.createElement("h2");
      title.dataset.slot = "alert-dialog-title";
      title.dataset.testid = name;
      title.className = "text-lg font-semibold";
      title.textContent = name;
      header.append(title);
      content.append(header);
      fixture.append(content);
    }
    document.body.append(fixture);
  });
  try {
    await expect(page.getByTestId("default-media")).toHaveCSS("grid-column-start", "2");
    for (const name of ["small-media", "default-no-media", "small-no-media"])
      await expect(page.getByTestId(name)).toHaveCSS("grid-column-start", "auto");
    await page.setViewportSize({ width: 639, height: 800 });
    for (const name of ["default-media", "small-media", "default-no-media", "small-no-media"])
      await expect(page.getByTestId(name)).toHaveCSS("grid-column-start", "auto");
    await page.setViewportSize({ width: 640, height: 800 });
    await expect(page.getByTestId("default-media")).toHaveCSS("grid-column-start", "2");
    await expect(page.getByTestId("small-media")).toHaveCSS("grid-column-start", "auto");
  } finally {
    await page.locator("#alert-dialog-layout-fixture").evaluate((fixture) => fixture.remove());
  }
});
