import { expect, test } from "@playwright/test";

test("dialogs preserve their exit frame and focus without rerendering the library, and defer Motion preparation", async ({
  page,
}) => {
  await page.route(
    /\/src\/components\/projects\/(ProjectDialog|templates\/TemplateGallery|items\/LibraryBrowser)\.tsx(?:\?|$)/,
    async (route) => {
      const response = await route.fetch();
      const name = route.request().url().includes("TemplateGallery")
        ? "TemplateGallery"
        : route.request().url().includes("LibraryBrowser")
          ? "LibraryBrowser"
          : "ProjectDashboard";
      const body = await response.text();
      const pattern = new RegExp(`function ${name}\\([\\s\\S]*?\\) \\{`);
      expect(body).toMatch(pattern);
      await route.fulfill({
        response,
        body: body.replace(
          pattern,
          `$&\nglobalThis.__dialogRenders["${name}"]=(globalThis.__dialogRenders["${name}"]??0)+1;`,
        ),
      });
    },
  );
  await page.addInitScript(() => {
    (window as unknown as { __dialogRenders: Record<string, number> }).__dialogRenders = {};
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "light");
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("./dashboard?automation=1");
  await expect(page.locator(".dashboard-grid-stage")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const readRenders = () =>
    page.evaluate(
      () => (window as unknown as { __dialogRenders: Record<string, number> }).__dialogRenders,
    );
  const before = await readRenders();
  const preferences = page.getByRole("button", { name: "Preferences", exact: true });
  await preferences.click();
  await expect(page.locator(".preferences-dialog")).toBeVisible();
  expect(await readRenders()).toEqual(before);
  async function dismiss(selector: string) {
    await page.evaluate((selector) => {
      const state = window as unknown as {
        exitFrame: Promise<{ state: string | null; opacity: number; elapsed: number }>;
      };
      state.exitFrame = new Promise((resolve) => {
        let pressedAt = performance.now();
        document.addEventListener(
          "pointerdown",
          (event) => {
            pressedAt = event.timeStamp;
          },
          { once: true, capture: true },
        );
        const started = (event: AnimationEvent) => {
          if (
            event.animationName !== "dialog-surface-out" ||
            !(event.target as Element).matches(selector)
          )
            return;
          document.removeEventListener("animationstart", started);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const node = document.querySelector(selector);
              resolve({
                state: node?.getAttribute("data-state") ?? null,
                opacity: node ? Number(getComputedStyle(node).opacity) : 0,
                elapsed: performance.now() - pressedAt,
              });
            }),
          );
        };
        document.addEventListener("animationstart", started);
      });
    }, selector);
    await page.locator(`${selector} [data-slot="dialog-close"]`).click();
    const exit = await page.evaluate(
      () =>
        (
          window as unknown as {
            exitFrame: Promise<{ state: string | null; opacity: number; elapsed: number }>;
          }
        ).exitFrame,
    );
    expect(exit.state).toBe("closed");
    expect(exit.opacity).toBeGreaterThan(0);
    expect(exit.opacity).toBeLessThan(1);
    console.log(`${selector}: native pointer → second exit RAF (ms)`, exit.elapsed);
    await expect(page.locator(selector)).toHaveCount(0);
    expect(await readRenders()).toEqual(before);
  }
  await dismiss(".preferences-dialog");
  await expect(preferences).toBeFocused();
  const staticItem = page.getByRole("button", { name: "Preview Colorfield", exact: true });
  await staticItem.click();
  await expect(page.locator(".library-item-dialog")).toBeVisible();
  await dismiss(".library-item-dialog");
  await expect(staticItem).toBeFocused();
  await page.evaluate(() => {
    const state = window as unknown as { enterEnded: number; firstCanvas: number };
    state.enterEnded = 0;
    state.firstCanvas = 0;
    document.addEventListener("animationend", (event) => {
      if (
        event.animationName === "dialog-surface-in" &&
        (event.target as Element).matches(".library-item-dialog")
      )
        state.enterEnded = performance.now();
    });
    const observer = new MutationObserver(() => {
      if (document.querySelector(".library-item-dialog canvas")) {
        state.firstCanvas = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: "Preview Melt Mascot", exact: true }).click();
  await page.locator(".library-item-preview").hover();
  const motion = page.locator(
    '.library-item-dialog .motion-template-preview[data-preview-status="playing"]',
  );
  await expect(motion).toBeVisible();
  const timing = await page.evaluate(() => {
    const s = window as unknown as { enterEnded: number; firstCanvas: number };
    return { enterEnded: s.enterEnded, firstCanvas: s.firstCanvas };
  });
  expect(timing.enterEnded).toBeGreaterThan(0);
  expect(timing.firstCanvas).toBeGreaterThan(timing.enterEnded);
  await dismiss(".library-item-dialog");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await preferences.click();
  expect(
    await page
      .locator(".preferences-dialog")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page.locator('.preferences-dialog [data-slot="dialog-close"]').click();
  await expect(page.locator(".preferences-dialog")).toHaveCount(0);
  await expect(preferences).toBeFocused();
});
