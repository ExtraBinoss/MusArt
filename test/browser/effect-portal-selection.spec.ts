import { expect, test } from "@playwright/test";
import { photographicEffect } from "./support/photographic-effect";
import { stableEffectSelection } from "./support/effect-control-input";

for (const expanded of [false, true]) {
  test(`Receipt controls preserve the attachment target from the ${expanded ? "expanded row" : "avatar"}`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
    const fixture = await photographicEffect(page, "receipt", false);
    try {
      await fixture.load({ id: "receipt-portals" });
      await page.evaluate(() => window.musart!.select(["receipt-image"]));
      await expect(page.locator(".inspector")).toHaveAttribute(
        "data-selected-layer-id",
        "receipt-image",
      );
      const row = page.locator('.layer-row[data-layer-id="receipt-image"]');
      const avatar = row.locator('[data-attachment-effect-id="receipt-portals"]');
      if (expanded) await row.locator(".group-chevron").click();
      const child = page.locator('[data-effect-id="receipt-portals"]');
      await (expanded ? child.locator(".attachment-name") : avatar).click();
      const popup = page.locator('.layer-attachment-popover[data-state="open"]');
      await expect(avatar).toHaveAttribute("aria-pressed", "true");
      const original = await page.evaluate(() => window.musart!.snapshot().revision);
      for (const name of ["Alpha composition", "Thermal halftone", "Blend mode"]) {
        const select = popup.getByRole("combobox", { name, exact: true });
        await select.click();
        await expect(page.getByRole("listbox")).toBeVisible();
        await stableEffectSelection(page, "receipt-image");
        await expect(avatar).toHaveAttribute("aria-pressed", "true");
        if (expanded) await expect(child).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("listbox")).toHaveCount(0);
        await expect(select).toBeFocused();
      }
      const input = popup.locator(".effect-compositing").getByRole("textbox");
      await input.click({ button: "right" });
      await expect(avatar).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await input.click();
      await stableEffectSelection(page, "receipt-image");
      expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(original);
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await expect(avatar).toHaveAttribute("aria-pressed", "true");
      await row.locator(".layer-name").click();
      await expect(avatar).toHaveAttribute("aria-pressed", "false");
      await expect(row).toHaveAttribute("aria-selected", "true");
      expect(fixture.errors).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
}
