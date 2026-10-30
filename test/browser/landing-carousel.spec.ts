import { expect, test, type Locator } from "@playwright/test";

const position = (rail: Locator) => rail.getAttribute("data-carousel-position");

test("automatic drift pauses for hover, keyboard focus and offscreen content, then resumes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?automation=1&welcome=1");
  const rail = page.locator("[data-carousel]");
  await rail.scrollIntoViewIfNeeded();
  await expect(rail).toHaveAttribute("data-carousel-auto");
  const first = await position(rail);
  const renders = await page.locator(".musart-app").getAttribute("data-react-renders");
  expect(renders).not.toBeNull();
  await expect.poll(() => position(rail)).not.toBe(first);
  expect(await page.locator(".musart-app").getAttribute("data-react-renders")).toBe(renders);
  const bloom = rail.getByRole("button", {
    name: "Créer depuis In Bloom — Démo Motion",
    exact: true,
  });
  await rail.hover();
  await expect(rail).not.toHaveAttribute("data-carousel-auto");
  await bloom.hover();
  await expect(bloom.locator("[data-preview-status]")).toHaveAttribute(
    "data-preview-status",
    "playing",
  );
  const hovered = await position(rail);
  await page.waitForTimeout(150);
  expect(await position(rail)).toBe(hovered);
  await page.mouse.move(10, 20);
  await expect(rail).toHaveAttribute("data-carousel-auto");
  await expect(bloom.locator("canvas")).toHaveCount(0);
  await expect.poll(() => position(rail)).not.toBe(hovered);
  await rail.focus();
  await page.keyboard.press("ArrowRight");
  await expect(rail).not.toHaveAttribute("data-carousel-auto");
  await expect(rail).not.toHaveAttribute("data-carousel-moving");
  const focused = await position(rail);
  await page.waitForTimeout(150);
  expect(await position(rail)).toBe(focused);
  await rail.evaluate((node: HTMLElement) => node.blur());
  await expect(rail).toHaveAttribute("data-carousel-auto");
  await page.locator(".landing-footer").scrollIntoViewIfNeeded();
  await expect(rail).not.toHaveAttribute("data-carousel-auto");
  const offscreen = await position(rail);
  await page.waitForTimeout(150);
  expect(await position(rail)).toBe(offscreen);
  await rail.scrollIntoViewIfNeeded();
  await expect(rail).toHaveAttribute("data-carousel-auto");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(rail).not.toHaveAttribute("data-carousel-auto");
  const reduced = await position(rail);
  await page.waitForTimeout(150);
  expect(await position(rail)).toBe(reduced);
});

async function coverage(rail: Locator) {
  return rail.evaluate((node) => {
    const viewport = node.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(node).columnGap);
    const cards = [...node.querySelectorAll(".landing-template-card")]
      .map((card) => card.getBoundingClientRect())
      .filter((box) => box.right > viewport.left && box.left < viewport.right)
      .sort((a, b) => a.left - b.left);
    return {
      start: cards[0]!.left <= viewport.left + 1,
      end: cards.at(-1)!.right >= viewport.right - 1,
      continuous: cards.every(
        (box, index) => !index || box.left - cards[index - 1]!.right <= gap + 2,
      ),
    };
  });
}

test("the single template rail loops both ways and coasts after a real mouse pan", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?automation=1&welcome=1");
  const rail = page.locator("[data-carousel]");
  await expect(rail).toHaveAttribute("data-carousel-position");
  await rail.scrollIntoViewIfNeeded();
  await expect(rail.getByRole("button")).toHaveCount(6);
  await expect(page.locator(".landing-showcase-controls")).toHaveCount(0);
  await expect(rail).toHaveCSS("overflow-x", "clip");
  await expect(rail).toHaveCSS("scrollbar-width", "none");
  const first = rail.locator(".landing-template-card").first();
  await expect(first).toHaveCSS("transition-property", "none");
  const handle = await first.elementHandle();
  const period = await rail.evaluate((node) => {
    const cards = [...node.querySelectorAll<HTMLElement>(".landing-template-card")];
    return (
      cards.at(-1)!.offsetLeft -
      cards[0]!.offsetLeft +
      cards.at(-1)!.offsetWidth +
      Number.parseFloat(getComputedStyle(node).columnGap)
    );
  });
  await rail.hover();
  await expect(rail).not.toHaveAttribute("data-carousel-auto");
  const original = (await first.boundingBox())!.x;
  async function wheel(delta: number) {
    const delivered = rail.evaluate(
      (node) =>
        new Promise<void>((resolve) => {
          node.addEventListener("wheel", () => requestAnimationFrame(() => resolve()), {
            once: true,
          });
        }),
    );
    await page.mouse.wheel(delta, 0);
    await delivered;
  }
  await wheel(period * 3);
  await expect(rail).not.toHaveAttribute("data-carousel-moving");
  expect(Math.abs((await first.boundingBox())!.x - original)).toBeLessThan(3);
  expect(await coverage(rail)).toEqual({ start: true, end: true, continuous: true });
  await wheel(-period * 7 - 190);
  await expect(rail).not.toHaveAttribute("data-carousel-moving");
  expect(await coverage(rail)).toEqual({ start: true, end: true, continuous: true });
  const landing = page.locator(".landing-page");
  const vertical = await landing.evaluate((node) => node.scrollTop);
  const beforeWheel = await position(rail);
  await page.mouse.wheel(0, 90);
  await expect
    .poll(() => landing.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(vertical + 20);
  expect(await position(rail)).toBe(beforeWheel);
  await rail.scrollIntoViewIfNeeded();
  expect(
    await handle!.evaluate((node) => node === document.querySelector(".landing-template-card")),
  ).toBe(true);
  const before = await page.evaluate(() => window.musart!.snapshot().project);
  const bounds = (await rail.boundingBox())!;
  await page.mouse.move(900, bounds.y + 150);
  await page.mouse.down();
  await page.mouse.move(480, bounds.y + 150, { steps: 8 });
  await expect(rail).toHaveAttribute("data-carousel-moving");
  const release = await position(rail);
  await page.mouse.up();
  await expect.poll(() => position(rail)).not.toBe(release);
  await expect(rail).not.toHaveAttribute("data-carousel-moving");
  const settled = await position(rail);
  await page.waitForTimeout(100);
  expect(await position(rail)).toBe(settled);
  expect(await coverage(rail)).toEqual({ start: true, end: true, continuous: true });
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
  await expect(rail.getByRole("button")).toHaveCount(6);
  await rail.getByRole("button", { name: "Créer depuis Story Instagram", exact: true }).focus();
  await expect(
    rail.getByRole("button", { name: "Créer depuis Story Instagram", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await rail.screenshot({ path: info.outputPath("infinite-carousel.png") });
  await page.setViewportSize({ width: 3840, height: 1100 });
  await expect.poll(() => coverage(rail)).toEqual({ start: true, end: true, continuous: true });
  await expect(rail.getByRole("button")).toHaveCount(6);
});

test.describe("touch rail", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("native swipes retain vertical page scrolling and reduced motion stops at release", async ({
    page,
    context,
  }) => {
    await page.goto("/?automation=1&welcome=1");
    const rail = page.locator("[data-carousel]");
    await expect(rail).toHaveAttribute("data-carousel-position");
    await rail.scrollIntoViewIfNeeded();
    const cdp = await context.newCDPSession(page);
    async function swipe(dx: number, dy: number) {
      const box = (await rail.boundingBox())!;
      const x = 300,
        y = Math.max(100, box.y + 130);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let step = 1; step <= 6; step++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + (dx * step) / 6, y: y + (dy * step) / 6, id: 1 }],
        });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const before = await position(rail);
    await swipe(-210, 0);
    await expect.poll(() => position(rail)).not.toBe(before);
    await expect(rail).not.toHaveAttribute("data-carousel-moving");
    const horizontal = await position(rail);
    const landing = page.locator(".landing-page");
    const scroll = await landing.evaluate((node) => node.scrollTop);
    await swipe(0, -160);
    await expect
      .poll(() => landing.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(scroll + 20);
    expect(await position(rail)).toBe(horizontal);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await rail.scrollIntoViewIfNeeded();
    await swipe(-150, 0);
    const release = await position(rail);
    await expect(rail).not.toHaveAttribute("data-carousel-moving");
    await page.waitForTimeout(150);
    expect(await position(rail)).toBe(release);
    await expect(page.locator(".landing-page")).toBeVisible();
    await cdp.detach();
  });
});
