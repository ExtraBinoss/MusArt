import { expect, type Locator, type Page } from "@playwright/test";

export async function assertDropPlacement(page: Page, target: Locator, screenshot?: string) {
  const halo = page.locator(".dnd-placement-halo");
  await expect(halo).toHaveCount(1);
  await expect(halo).toBeVisible();
  const placed = (await target.boundingBox())!;
  const highlight = (await halo.boundingBox())!;
  expect(highlight.y).toBeCloseTo(placed.y, 0);
  expect(highlight.x).toBeCloseTo(placed.x, 0);
  const visibleWidth = await target.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const viewport = node
      .closest("[data-layer-drag-viewport], [data-dock-scroll]")
      ?.getBoundingClientRect();
    return (
      Math.min(bounds.right, viewport?.right ?? window.innerWidth) -
      Math.max(bounds.left, viewport?.left ?? 0)
    );
  });
  expect(highlight.width).toBeGreaterThanOrEqual(visibleWidth - 1);
  expect(highlight.height).toBeCloseTo(placed.height, 0);
  const animation = await halo.evaluate((node) => ({
    name: getComputedStyle(node).animationName,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  expect(animation.name).toBe(animation.reduced ? "none" : "dnd-placement-glow");
  if (screenshot) await page.screenshot({ path: screenshot });
  await expect(halo).toHaveCount(0, { timeout: 2000 });
}
