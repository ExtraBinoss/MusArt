import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installNativeDragProbe, assertNativeMove } from "./support/native-drag";
type WorkWindow = Window & {
  __uiMotionWork: { encodes: number; submissions: number };
  __layerDragImage?: {
    background: string;
    name: string | null;
    children: number;
    controls: number;
    decoded: boolean;
    opacity: string;
    animation: string;
  };
};

test("layer expansion animates bounded real rows, ordinary scrolling and native drag retain identity, and recenter matches zoom height", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const work = { encodes: 0, submissions: 0 };
    (window as unknown as WorkWindow).__uiMotionWork = work;
    const dragImage = DataTransfer.prototype.setDragImage;
    DataTransfer.prototype.setDragImage = function (element, x, y) {
      const image = element.querySelector("img");
      (window as unknown as WorkWindow).__layerDragImage = {
        background: getComputedStyle(element).backgroundColor,
        name: element.querySelector(".layer-name")?.textContent ?? null,
        children: element.children.length,
        controls: element.querySelectorAll("button, .layer-actions, [data-attachment-target]")
          .length,
        decoded: !!image?.complete && image.naturalWidth > 0,
        opacity: image ? getComputedStyle(image).opacity : "",
        animation: image ? getComputedStyle(image).animationName : "",
      };
      dragImage.call(this, element, x, y);
    };
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args: Parameters<typeof encode>) {
      work.encodes++;
      return encode.apply(this, args);
    };
    if (typeof GPUQueue !== "undefined") {
      const submit = GPUQueue.prototype.submit;
      GPUQueue.prototype.submit = function (...args: Parameters<typeof submit>) {
        work.submissions++;
        return submit.apply(this, args);
      };
    }
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const group = createLayer("group", {
    id: "motion-group",
    name: "Motion group",
    width: 200,
    height: 150,
  });
  const children = Array.from({ length: 300 }, (_, at) =>
    createLayer("rectangle", {
      id: `motion-child-${at}`,
      parentId: group.id,
      name: `Child ${at}`,
      width: 40,
      height: 30,
    }),
  );
  const loose = createLayer("rectangle", {
    id: "motion-loose",
    name: "Loose layer",
    x: 220,
    y: 30,
    width: 70,
    height: 70,
  });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [createPage({ width: 400, height: 300, layers: [group, ...children, loose] })],
    }),
  );
  await expect(page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]')).toBeVisible();
  const row = page.locator('[data-layer-id="motion-group"]'),
    tree = page.locator(".layer-tree"),
    treeWindow = page.locator(".layer-tree-window");
  const thumbnail = page.locator('[data-layer-id="motion-child-299"] .layer-thumbnail img');
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() => thumbnail.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(thumbnail).toHaveAttribute("data-thumbnail-reveal", "true");
  await expect(thumbnail).toHaveCSS("animation-name", "layer-thumbnail-reveal");
  await expect(thumbnail).toHaveCSS("animation-duration", "0.1s");
  await expect(thumbnail).toHaveCSS("opacity", "1");
  await expect(page.locator('[data-layer-id="motion-loose"]')).toHaveCSS("cursor", "default");
  const commits = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => [
            selector,
            Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
          ],
        ),
      ),
    );
  const before = await commits();
  await row.getByRole("button", { name: "Motion group", exact: true }).click();
  await expect(treeWindow).toHaveAttribute("data-expanding", "true");
  await expect(page.locator("[data-expansion-exit]").first()).toHaveAttribute("inert", "");
  expect(await page.locator(".layer-tree [data-layer-tree-key]").count()).toBeLessThan(70);
  await expect(treeWindow).not.toHaveAttribute("data-expanding");
  await expect(page.locator('[data-layer-id^="motion-child-"]')).toHaveCount(0);
  expect(await commits()).toEqual(before);
  await row.getByRole("button", { name: "Motion group", exact: true }).click();
  await expect(treeWindow).toHaveAttribute("data-expanding", "true");
  await expect(treeWindow).not.toHaveAttribute("data-expanding");
  await expect(row.locator(".layer-chevron-icon")).toHaveCSS(
    "transform",
    "matrix(0, 1, -1, 0, 0, 0)",
  );
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).not.toHaveAttribute("data-thumbnail-reveal");
  const top = await tree.evaluate((element) => element.scrollTop);
  expect(top).toBe(0);
  await tree.hover();
  await page.mouse.wheel(0, 420);
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(treeWindow).not.toHaveAttribute("data-expanding");
  await tree.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBe(0);
  const looseRow = page.locator('[data-layer-id="motion-loose"]');
  await expect(looseRow).toBeVisible();
  await expect
    .poll(() =>
      looseRow
        .locator(".layer-thumbnail img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await looseRow.evaluate((element) => {
    (element as HTMLElement).dataset.nativeIdentity = "retained";
  });
  const sourceBox = (await looseRow.boundingBox())!;
  await page.mouse.move(sourceBox.x + 100, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 120, sourceBox.y + sourceBox.height / 2, { steps: 4 });
  await expect(looseRow).toHaveAttribute("data-dragging", "true");
  await expect(looseRow).toHaveCSS("cursor", "grabbing");
  expect(await page.evaluate(() => (window as unknown as WorkWindow).__layerDragImage)).toEqual({
    background: "rgba(0, 0, 0, 0)",
    name: "Loose layer",
    children: 2,
    controls: 0,
    decoded: true,
    opacity: "1",
    animation: "none",
  });
  const held = await page.evaluate(() => ({ ...(window as unknown as WorkWindow).__uiMotionWork }));
  expect(held.submissions).toBeGreaterThan(0);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const tick = () => {
          if (++frames === 12) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(await page.evaluate(() => (window as unknown as WorkWindow).__uiMotionWork)).toEqual(held);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(looseRow).toHaveCSS("cursor", "default");
  await expect(page.locator(".layer-drag-preview")).toHaveCount(0);
  await installNativeDragProbe(page, "application/x-musart-layer");
  await looseRow.dragTo(page.locator('[data-layer-id="motion-child-299"]'), {
    targetPosition: { x: 180, y: 2 },
  });
  await assertNativeMove(page, loose.id);
  await expect(page.locator(".layer-drag-preview")).toHaveCount(0);
  await expect(looseRow).toHaveAttribute("data-native-identity", "retained");
  await expect(looseRow).toHaveCSS("cursor", "default");
  await page.evaluate(() => window.musart!.undo());
  const canvas = page.getByTestId("editor-canvas");
  await canvas.hover({ position: { x: 450, y: 250 } });
  await page.mouse.wheel(0, 400);
  const recenter = page.locator(".canvas-recenter");
  await expect(recenter).toBeVisible();
  expect((await recenter.boundingBox())!.height).toBe(40);
  expect((await page.locator(".canvas-controls").boundingBox())!.height).toBe(40);
  expect((await page.locator(".canvas-controls button").first().boundingBox())!.height).toBe(32);
  await page.screenshot({ path: "artifacts/screenshots/layer-motion-recenter.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(looseRow.locator(".layer-thumbnail img")).toHaveCSS("animation-name", "none");
  await row.getByRole("button", { name: "Motion group", exact: true }).click();
  await expect(treeWindow).not.toHaveAttribute("data-expanding");
  await expect(row.locator(".layer-chevron-icon")).toHaveCSS("transition-duration", "0s");
});

test("keyboard search focuses before its first frame, animates open and inert close, and returns focus to the canvas", async ({
  page,
}) => {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const canvas = page.getByTestId("editor-canvas"),
    trigger = page.locator(".toolbar .magic-search-trigger");
  await canvas.focus();
  await page.evaluate(() => {
    const task = new Promise<unknown[]>((resolve) => {
      const samples: unknown[] = [];
      const sample = () => {
        const dialog = document.querySelector<HTMLElement>("[data-magic-search]");
        const trigger = document.querySelector<HTMLElement>(".toolbar .magic-search-trigger");
        samples.push({
          focus: document.activeElement?.getAttribute("role"),
          opacity: dialog ? Number(getComputedStyle(dialog).opacity) : null,
          triggerFocused: document.activeElement === trigger,
          triggerRing: trigger?.matches(":focus-visible"),
        });
        if (samples.length < 12) requestAnimationFrame(sample);
        else resolve(samples);
      };
      const opened = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
        document.removeEventListener("keydown", opened, true);
        requestAnimationFrame(sample);
      };
      document.addEventListener("keydown", opened, true);
    });
    (window as unknown as { __searchMotion?: Promise<unknown[]> }).__searchMotion = task;
  });
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox")).toBeFocused();
  const samples = await page.evaluate(
    () =>
      (
        window as unknown as {
          __searchMotion: Promise<
            { focus: string; opacity: number; triggerFocused: boolean; triggerRing: boolean }[]
          >;
        }
      ).__searchMotion,
  );
  expect(samples[0]!.focus).toBe("combobox");
  expect(samples.every((sample) => !sample.triggerFocused && !sample.triggerRing)).toBe(true);
  expect(samples.some((sample) => sample.opacity > 0 && sample.opacity < 1)).toBe(true);
  expect(await page.getByRole("option").count()).toBeLessThanOrEqual(24);
  await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>("[data-magic-search]")!;
    (
      window as unknown as { __searchExit: Promise<{ inert: boolean; pointerEvents: string }> }
    ).__searchExit = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!dialog.inert) return;
        observer.disconnect();
        resolve({ inert: dialog.inert, pointerEvents: getComputedStyle(dialog).pointerEvents });
      });
      observer.observe(dialog, { attributes: true });
    });
  });
  await page.getByRole("combobox").press("Escape");
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __searchExit: Promise<{ inert: boolean; pointerEvents: string }>;
          }
        ).__searchExit,
    ),
  ).toEqual({ inert: true, pointerEvents: "none" });
  await expect(page.locator("[data-magic-search]")).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await expect(trigger).not.toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("combobox")).toBeFocused();
  await expect(page.locator("[data-magic-search]")).toHaveCSS("opacity", "1");
  const rulers = await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.rulers);
  await page.getByRole("combobox").fill("règles");
  await page.locator('[role="option"][data-value="action:rulers"]').click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.rulers))
    .toBe(!rulers);
});
