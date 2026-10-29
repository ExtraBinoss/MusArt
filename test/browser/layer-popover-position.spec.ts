import { expect, test, type Locator, type Page } from "@playwright/test";
import { createEffect, createLayer } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";

async function settled(page: Page) {
  await page.locator('.layer-attachment-popover[data-state="open"]').evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

test("Receipt popovers stay beside their native owner after scroll, resize, handoff and rapid reopen", async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  const fixture = await photographicEffect(page, "receipt", false);
  const cohort = process.env.MUSART_POSITION_COHORT ?? "candidate";
  const directory = "artifacts/layer-popover-position";
  const samples: unknown[] = [];
  await mkdir(directory, { recursive: true });
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const projectId = await fixture.load({ id: "position-receipt-a" });
    const project = await page.evaluate(() => window.musart!.snapshot().project);
    const original = project.pages[0]!.layers[0]!;
    const other = createLayer("image", {
      ...original,
      id: "position-image-b",
      name: "Other Receipt owner",
      x: 8,
      y: 8,
      effects: [createEffect("receipt", { id: "position-receipt-b" })],
    });
    const filler = (index: number) =>
      createLayer("rectangle", {
        id: `position-filler-${index}`,
        name: `Position filler ${index}`,
        x: 1,
        y: 1,
        width: 1,
        height: 1,
        visible: false,
      });
    project.pages[0]!.layers = [
      ...Array.from({ length: 16 }, (_, at) => filler(at)),
      original,
      other,
      ...Array.from({ length: 4 }, (_, at) => filler(at + 16)),
    ];
    await page.evaluate((project) => window.musart!.load(project), project);
    await fixture.ready(projectId);
    const tree = page.locator(".layer-tree");
    await tree.evaluate((node) => {
      node.scrollTop = 72;
    });
    const first = page.locator('[data-attachment-effect-id="position-receipt-a"]');
    const second = page.locator('[data-attachment-effect-id="position-receipt-b"]');
    await expect(first).toBeVisible();
    await expect(first.locator("img")).toBeVisible();
    await first.locator("img").evaluate((node: HTMLImageElement) => node.decode());
    const baseline = await page.evaluate(() => window.musart!.snapshot());
    const popup = page.locator('.layer-attachment-popover[data-state="open"]');
    async function record(label: string, trigger: Locator, assertPlacement = true) {
      await expect(popup).toHaveCount(1);
      await settled(page);
      const sample = await trigger.evaluate((button, label) => {
        const popup = document.querySelector<HTMLElement>(
          '.layer-attachment-popover[data-state="open"]',
        )!;
        const row = button.closest<HTMLElement>(".layer-row,.layer-attachment-row")!;
        const wrapper = popup.closest<HTMLElement>("[data-radix-popper-content-wrapper]")!;
        const describe = (node: Element) => {
          const style = getComputedStyle(node);
          return {
            rect: node.getBoundingClientRect().toJSON(),
            style: {
              position: style.position,
              left: style.left,
              top: style.top,
              transform: style.transform,
              zoom: style.zoom,
              width: style.width,
              height: style.height,
            },
            inline: node.getAttribute("style"),
            side: node.getAttribute("data-side"),
            align: node.getAttribute("data-align"),
          };
        };
        const popupDescription = describe(popup);
        const rowDescription = describe(row);
        const anchorDiagnostics: unknown[] = [];
        let anchorIdentity: {
          providerAnchorIsElement: boolean;
          providerMatchesCurrentFacade: boolean;
          providerMatchesCurrentTrigger: boolean;
          providerContextIsOwnerRow: boolean;
        } | null = null;
        if (popupDescription.rect.width > 0) {
          let closestProviderAnchor: unknown;
          let currentFacade: unknown;
          let currentTrigger: unknown;
          interface Hook {
            memoizedState: unknown;
            next?: Hook;
          }
          interface Fiber {
            type?: unknown;
            memoizedProps?: Record<string, unknown>;
            memoizedState?: Hook;
            return?: Fiber;
          }
          const inspect = (value: unknown) => {
            if (!value || typeof value !== "object") return null;
            if (value instanceof Element)
              return {
                kind: "element",
                nodeName: value.nodeName,
                connected: value.isConnected,
                outerHTML: value.outerHTML.slice(0, 250),
                rect: value.getBoundingClientRect().toJSON(),
              };
            const candidate = value as Record<string, unknown>;
            const current = candidate.current;
            if (typeof candidate.isLive === "function")
              return {
                leaseOwner: candidate.ownerKey,
                live: Reflect.apply(candidate.isLive, value, []),
              };
            if (current instanceof Element)
              return {
                refElement: current.outerHTML.slice(0, 250),
                connected: current.isConnected,
              };
            const anchor =
              current && typeof current === "object"
                ? (current as Record<string, unknown>)
                : candidate;
            if (typeof anchor.getBoundingClientRect !== "function") return null;
            const context = anchor.contextElement;
            return {
              anchorRect: Reflect.apply(anchor.getBoundingClientRect, anchor, []).toJSON(),
              context:
                context instanceof Element
                  ? {
                      tag: context.tagName,
                      classes: context.className,
                      connected: context.isConnected,
                    }
                  : null,
            };
          };
          const key = Object.keys(button).find((key) => key.startsWith("__reactFiber$"));
          let fiber = key
            ? ((button as unknown as Record<string, unknown>)[key] as Fiber)
            : undefined;
          for (let depth = 0; fiber && depth < 60; depth++, fiber = fiber.return) {
            const type = fiber.type as { name?: string; displayName?: string } | null;
            const component =
              typeof fiber.type === "string"
                ? fiber.type
                : (type?.displayName ?? type?.name ?? typeof fiber.type);
            const hooks: unknown[] = [];
            for (let hook = fiber.memoizedState, at = 0; hook && at < 60; hook = hook.next, at++) {
              const value = hook.memoizedState;
              const unwrapped = Array.isArray(value) ? value[0] : value;
              const info = inspect(unwrapped);
              if (info) hooks.push({ at, ...info });
              if (
                fiber.memoizedProps?.effectId ===
                  button.getAttribute("data-attachment-effect-id") &&
                fiber.memoizedProps?.engine &&
                fiber.memoizedProps?.children &&
                unwrapped &&
                typeof unwrapped === "object"
              ) {
                const current = (unwrapped as { current?: unknown }).current;
                if (current instanceof Element) currentTrigger = current;
                else if (
                  current &&
                  typeof current === "object" &&
                  "getBoundingClientRect" in current
                )
                  currentFacade = current;
              }
            }
            const value = fiber.memoizedProps?.value;
            const provider =
              value && typeof value === "object" ? (value as Record<string, unknown>) : null;
            if (!closestProviderAnchor && provider?.anchor) closestProviderAnchor = provider.anchor;
            const virtualAnchor = inspect(fiber.memoizedProps?.virtualRef);
            const providerAnchor = inspect(provider?.anchor);
            if (hooks.length || virtualAnchor || providerAnchor)
              anchorDiagnostics.push({
                depth,
                component,
                virtualAnchor,
                providerAnchor,
                hooks,
              });
          }
          anchorIdentity = {
            providerAnchorIsElement: closestProviderAnchor instanceof Element,
            providerMatchesCurrentFacade: closestProviderAnchor === currentFacade,
            providerMatchesCurrentTrigger: closestProviderAnchor === currentTrigger,
            providerContextIsOwnerRow:
              closestProviderAnchor !== null &&
              typeof closestProviderAnchor === "object" &&
              (closestProviderAnchor as { contextElement?: unknown }).contextElement === row,
          };
          anchorDiagnostics.push({
            identity: {
              ...anchorIdentity,
              providerAnchor: inspect(closestProviderAnchor),
              currentFacade: inspect(currentFacade),
              currentTrigger: inspect(currentTrigger),
            },
          });
        }
        return {
          label,
          at: performance.now(),
          trigger: describe(button),
          row: rowDescription,
          popup: popupDescription,
          wrapper: describe(wrapper),
          anchorIdentity,
          anchorDiagnostics,
          viewport: {
            width: innerWidth,
            height: innerHeight,
            dpr: devicePixelRatio,
            zoom: getComputedStyle(document.documentElement).zoom,
            visualScale: visualViewport?.scale,
            offsetLeft: visualViewport?.offsetLeft,
            offsetTop: visualViewport?.offsetTop,
          },
          scrollTop: document.querySelector<HTMLElement>(".layer-attachment-viewport")?.scrollTop,
          owner: button.getAttribute("data-attachment-effect-id"),
        };
      }, label);
      samples.push(sample);
      await writeFile(
        `${directory}/${cohort}.json`,
        JSON.stringify({ browser: browser.version(), samples, errors: fixture.errors }, null, 2),
      );
      await page.screenshot({ path: `${directory}/${cohort}-${label}.png` });
      const {
        popup: { rect },
        row: { rect: rowRect },
        viewport,
      } = sample;
      if (!assertPlacement) return sample;
      expect
        .soft(sample.anchorIdentity?.providerAnchorIsElement, `${label}: virtual anchor`)
        .toBe(false);
      expect
        .soft(sample.anchorIdentity?.providerMatchesCurrentFacade, `${label}: live facade`)
        .toBe(true);
      expect
        .soft(sample.anchorIdentity?.providerContextIsOwnerRow, `${label}: row context`)
        .toBe(true);
      expect.soft(sample.popup.side, `${label}: native placement side`).toBe("left");
      expect.soft(rect.x, `${label}: within left edge`).toBeGreaterThanOrEqual(-1);
      expect.soft(rect.y, `${label}: within top edge`).toBeGreaterThanOrEqual(-1);
      expect
        .soft(rect.right, `${label}: within right edge`)
        .toBeLessThanOrEqual(viewport.width + 1);
      expect
        .soft(rect.bottom, `${label}: within bottom edge`)
        .toBeLessThanOrEqual(viewport.height + 1);
      expect.soft(rect.right, `${label}: left of owner`).toBeLessThanOrEqual(rowRect.x + 2);
      expect.soft(Math.abs(rowRect.x - rect.right), `${label}: beside owner row`).toBeLessThan(24);
      expect
        .soft(rowRect.y, `${label}: vertical owner remains beside popup`)
        .toBeGreaterThanOrEqual(rect.y - 2);
      expect
        .soft(rowRect.y, `${label}: vertical owner remains beside popup`)
        .toBeLessThanOrEqual(rect.bottom + 2);
      return sample;
    }
    await first.click();
    const standard = await record("standard1600", first);
    if (process.env.MUSART_POSITION_STANDARD_ONLY === "1") return;
    const box = (await tree.boundingBox())!;
    await page.mouse.move(box.x + 15, box.y + box.height * 0.5);
    await page.mouse.wheel(0, 36);
    await expect.poll(() => tree.evaluate((node) => node.scrollTop)).toBeGreaterThan(72);
    const moved = await record("scrolled-owner", first);
    expect(moved.row.rect.y).toBeLessThan(standard.row.rect.y);
    await page.setViewportSize({ width: 1227, height: 1002 });
    await record("resized1227", first);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await first.click();
    await record("fresh1227", first);
    await second.click();
    await record("other-owner1227", second);
    await popup.locator(".layer-attachment-viewport").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await second.click();
    const reopened = await record("rapid-reopen1227", second);
    expect(reopened.scrollTop).toBe(0);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    if (process.env.MUSART_POSITION_CSS_ZOOM === "1") {
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1.25";
      });
      await second.click();
      await record("css-zoom125-diagnostic", second, false);
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await page.evaluate(() => {
        document.documentElement.style.zoom = "";
      });
    }
    const after = await page.evaluate(() => window.musart!.snapshot());
    expect(after.project).toEqual(baseline.project);
    expect(after.revision).toBe(baseline.revision);
    expect(after.canUndo).toBe(baseline.canUndo);
    expect(fixture.errors).toEqual([]);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
  } finally {
    await writeFile(
      `${directory}/${cohort}.json`,
      JSON.stringify({ browser: browser.version(), samples, errors: fixture.errors }, null, 2),
    );
    await fixture.close();
  }
});
