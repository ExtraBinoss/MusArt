import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { authored, counters, fixture, frames, output, prepare } from "./support/motion-canvas";

test("captured scrubbing stays inside the visible ruler between the gutter and action buttons", async ({
  page,
}) => {
  test.setTimeout(40_000);
  await mkdir(output, { recursive: true });
  await installReadbackProbe(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await prepare(page, fixture());
  const slider = page.getByRole("slider", { name: "Zoom de la timeline", exact: true });
  await slider.focus();
  await page.keyboard.press("End");
  await page.locator(".motion-timeline-scroll").evaluate((node) => {
    node.scrollLeft = 300;
  });
  await frames(page);
  const geometry = await page.evaluate(() => {
    const ruler = document.querySelector<HTMLElement>(".motion-ruler")!.getBoundingClientRect(),
      gutter = document.querySelector<HTMLElement>(".motion-ruler-label")!.getBoundingClientRect(),
      actions = document
        .querySelector<HTMLElement>(".motion-timeline-actions")!
        .getBoundingClientRect();
    return {
      origin: ruler.left,
      left: gutter.right,
      right: actions.left - 6,
      y: ruler.top + 12,
      actionPoint: actions.right - 3,
      scale: Number(
        document.querySelector("[aria-label='Zoom de la timeline']")!.getAttribute("aria-valuenow"),
      ),
    };
  });
  const before = await authored(page),
    quiet = await counters(page);
  await page.mouse.move((geometry.left + geometry.right) / 2, geometry.y);
  await page.mouse.down();
  try {
    await page.mouse.move(geometry.actionPoint, geometry.y);
    await frames(page);
    const ruler = page.locator(".motion-ruler");
    expect(Number(await ruler.getAttribute("aria-valuenow"))).toBeCloseTo(
      (geometry.right - geometry.origin) / geometry.scale,
      5,
    );
    const rightHead = (await page.locator(".motion-ruler-playhead").boundingBox())!;
    expect(rightHead.x + rightHead.width / 2).toBeLessThanOrEqual(geometry.right + 1);
    await page.screenshot({ path: `${output}/ruler-captured-right.png` });
    await page.mouse.move(Math.max(0, geometry.left - 100), geometry.y);
    await frames(page);
    expect(Number(await ruler.getAttribute("aria-valuenow"))).toBeCloseTo(
      (geometry.left - geometry.origin) / geometry.scale,
      5,
    );
    const leftHead = (await page.locator(".motion-ruler-playhead").boundingBox())!;
    expect(leftHead.x + leftHead.width / 2).toBeGreaterThanOrEqual(geometry.left - 1);
  } finally {
    await page.mouse.up();
  }
  expect(await counters(page)).toEqual(quiet);
  expect(await authored(page)).toEqual(before);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
});
