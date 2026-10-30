import { MOTION_ANIMATION_PRESETS, planMotionInitialization } from "@musart/core";
import { expect, test } from "@playwright/test";

test("motion presets stay simple, preview natively and persist globally across projects", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const snapshot = await page.evaluate(() => window.musart!.snapshot());
  await page.evaluate((plan) => {
    const api = window.musart!;
    api.execute({ type: "setCompositionMode", mode: "motion", plan, confirmed: true });
    const page = api.snapshot().project.pages[0]!;
    const subject = page.layers.find((layer) => layer.kind === "rectangle") ?? page.layers[0]!;
    api.select([subject.id]);
  }, planMotionInitialization(snapshot));
  const animations = page.locator(".layer-animations");
  await expect(page.locator(".inspector-selection-boundary")).toHaveAttribute("aria-busy", "false");
  await expect(animations).toBeVisible();
  await expect(page.locator(".motion-property-diamond:not([hidden])")).toHaveCount(0);
  await expect(page.locator(".inspector-selection-boundary")).toHaveAttribute("aria-busy", "false");
  await animations.getByRole("button", { name: "Add motion", exact: true }).click();
  const picker = page.locator(".motion-animation-popover");
  await expect(picker.locator(".animation-preset-grid")).toHaveAttribute(
    "data-total-presets",
    String(
      MOTION_ANIMATION_PRESETS.filter(
        (preset) => !preset.effects.some((effect) => effect.type === "morph"),
      ).length,
    ),
  );
  expect(await picker.locator(".animation-preset-card").count()).toBeLessThan(25);
  await expect(picker.locator("footer")).toHaveCount(0);
  const strip = picker.locator(".horizontal-scroll-viewport");
  const categoryBounds = await strip
    .locator("button")
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  expect(new Set(categoryBounds).size).toBe(1);
  await expect(picker.locator(".horizontal-scroll-arrow")).toHaveCount(0);
  await expect
    .poll(() =>
      picker
        .locator(".scroll-shadow-inline-end")
        .evaluate((node) => getComputedStyle(node).opacity),
    )
    .toBe("1");
  const gutter = await picker.evaluate((node) => {
    const popup = node.getBoundingClientRect(),
      viewport = node.querySelector(".animation-preset-scroll")!.getBoundingClientRect();
    return { right: popup.right - viewport.right, bottom: popup.bottom - viewport.bottom };
  });
  expect(gutter.right).toBeLessThanOrEqual(2);
  expect(gutter.bottom).toBeLessThanOrEqual(2);
  const scrollbar = () =>
    strip.evaluate((node) => ({
      thumb: getComputedStyle(node, "::-webkit-scrollbar-thumb").borderTopWidth,
      height: getComputedStyle(node, "::-webkit-scrollbar").height,
    }));
  await picker.locator("header").hover();
  expect(await scrollbar()).toEqual({ thumb: "2px", height: "6px" });
  await picker.locator(".scroll-shadow-inline-end").hover();
  await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(30);
  await strip.hover({ position: { x: 100, y: 5 } });
  expect((await scrollbar()).thumb).toBe("0px");
  await picker.locator("header").hover();
  const stopped = await strip.evaluate((node) => node.scrollLeft);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await strip.evaluate((node) => node.scrollLeft)).toBe(stopped);
  await strip.evaluate((node) => {
    node.scrollLeft = 0;
  });
  const scroller = picker.locator(".animation-preset-scroll");
  await scroller.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(picker.getByRole("button", { name: "Mosaic", exact: true })).toBeVisible();
  expect(await picker.locator(".animation-preset-card").count()).toBeLessThan(25);
  await scroller.evaluate((node) => {
    node.scrollTop = 0;
  });
  const originalPosition = await picker.boundingBox();
  await picker.getByRole("radio", { name: "My presets", exact: true }).click();
  await expect(
    picker.getByText("Save an animation to find it here, in every project."),
  ).toBeVisible();
  const personalPosition = await picker.boundingBox();
  expect(personalPosition!.x).toBeCloseTo(originalPosition!.x, 0);
  expect(personalPosition!.y).toBeCloseTo(originalPosition!.y, 0);
  expect(personalPosition!.height).toBeCloseTo(originalPosition!.height, 0);
  await picker.getByRole("radio", { name: "Library", exact: true }).click();
  const columns = await picker
    .locator(".animation-preset-window")
    .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(2);
  await picker.getByRole("button", { name: "Scale", exact: true }).click();
  const pop = picker.getByRole("button", { name: "Pop", exact: true });
  await pop.hover();
  await expect.poll(() => pop.locator("canvas").getAttribute("data-preview-frames")).not.toBeNull();
  await expect
    .poll(async () => Number(await pop.locator("canvas").getAttribute("data-preview-frames")))
    .toBeGreaterThan(1);
  await expect(picker.locator("canvas")).toHaveCount(1);
  await picker.screenshot({ path: "artifacts/motion-actions/preset-picker.png" });
  await pop.click();
  await expect(picker).toBeHidden();
  await expect(animations.locator(".animation-instance")).toHaveCount(1);
  await expect(page.locator(".motion-animation-block[data-animation-id]")).toHaveCount(1);
  await expect(page.locator(".inspector-selection-boundary")).toHaveAttribute("aria-busy", "false");
  const instance = animations.locator(".animation-instance");
  await instance.getByRole("button", { name: "More animation actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save as preset", exact: true }).click();
  await instance.getByRole("textbox", { name: "Preset name" }).fill("My native pop");
  await instance.getByRole("button", { name: "Save as preset", exact: true }).click();
  await expect(instance.getByRole("status")).toContainText("Saved");
  await page.locator(".motion-timeline-dock").hover();
  const pin = page.getByRole("button", { name: "Pin timeline", exact: true });
  if (await pin.isVisible()) await pin.click();
  const drag = page.locator(".motion-animation-block[data-animation-id]");
  const box = await drag.boundingBox();
  if (!box) throw Error("Animation block is missing");
  const before = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before + 1);
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
  await expect(page.locator(".motion-property-diamond:not([hidden])").first()).toBeVisible();
  await page.getByRole("button", { name: "Animations", exact: true }).click();
  await expect(page.locator(".motion-property-diamond:not([hidden])")).toHaveCount(0);
  await page.evaluate(() => {
    const api = window.musart!;
    const project = api.snapshot().project;
    project.id = crypto.randomUUID();
    project.name = "Another project";
    for (const page of project.pages)
      if (page.motion)
        for (const track of page.motion.tracks) {
          delete track.animations;
        }
    api.load(project);
    api.select([project.pages[0]!.layers.find((layer) => layer.kind === "rectangle")!.id]);
  });
  await expect(page.locator(".inspector-selection-boundary")).toHaveAttribute("aria-busy", "false");
  await animations.getByRole("button", { name: "Add motion", exact: true }).click();
  await expect(picker).toBeVisible();
  await picker.getByRole("radio", { name: "My presets", exact: true }).click();
  await expect(picker.getByRole("button", { name: "My native pop", exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "My native pop", exact: true }).click();
  await expect(animations.locator(".animation-instance-name")).toHaveText("My native pop");
  const applied = page.locator(".motion-animation-block[data-animation-id]");
  await page.locator(".motion-timeline-dock").hover();
  const repin = page.getByRole("button", { name: "Pin timeline", exact: true });
  if (await repin.isVisible()) await repin.click();
  await applied.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Save as preset", exact: true }).click();
  const saveDialog = page.getByRole("dialog", { name: "Save as preset", exact: true });
  await expect(saveDialog).toBeVisible();
  await saveDialog.getByRole("textbox", { name: "Preset name" }).fill("From the context menu");
  await saveDialog.getByRole("button", { name: "Save as preset", exact: true }).click();
  await expect(saveDialog).toBeHidden();
  await applied.click({ button: "right" });
  const remove = page.getByRole("menuitem", { name: "Delete animation", exact: true });
  await expect(remove).toHaveAttribute("data-variant", "destructive");
  expect(await remove.evaluate((node) => node.previousElementSibling?.getAttribute("role"))).toBe(
    "separator",
  );
  await remove.click();
  await expect(page.locator(".motion-animation-block[data-animation-id]")).toHaveCount(0);
  await page.evaluate(() => window.musart!.undo());
  await expect(page.locator(".motion-animation-block[data-animation-id]")).toHaveCount(1);
});

test("reference collage opens as editable action blocks with all replacement photographs", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  const gallery = page.getByRole("dialog");
  await gallery.getByRole("button", { name: "Templates", exact: true }).click();
  await gallery.getByRole("button", { name: "Create from Share Your Work", exact: true }).click();
  await expect(gallery).toBeHidden();
  await expect(page.locator(".motion-animation-block[data-animation-id]")).toHaveCount(11);
  await page.waitForFunction(
    () => {
      const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
      return (
        data?.pageId === window.musart!.snapshot().pageId &&
        data.rendererReady === "true" &&
        data.renderedRevision === data.sceneRevision
      );
    },
    undefined,
    { timeout: 20000 },
  );
  await page.locator(".motion-timeline-dock").hover();
  const pin = page.getByRole("button", { name: "Pin timeline", exact: true });
  if (await pin.isVisible()) await pin.click();
  await expect(page.locator(".motion-animation-block[data-animation-id]").first()).toBeInViewport();
  await expect(page.locator(".motion-timeline-dock")).not.toHaveAttribute("data-motion-animating");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await page.getByRole("spinbutton", { name: "Current time", exact: true }).inputValue(),
      ),
    )
    .toBeGreaterThan(300);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
    return (
      data?.pageId === window.musart!.snapshot().pageId &&
      data.rendererReady === "true" &&
      data.renderedRevision === data.sceneRevision
    );
  });
  await page.screenshot({ path: "artifacts/motion-actions/share-your-work-editor.png" });
  const result = await page.evaluate(async () => {
    const api = window.musart!,
      snapshot = api.snapshot();
    await api.save();
    await api.flush();
    return {
      name: snapshot.project.name,
      photos: Object.values(snapshot.project.assets).filter((asset) => asset.kind !== "audio")
        .length,
      tracks: snapshot.project.pages[0]!.motion!.tracks.length,
    };
  });
  expect(result).toMatchObject({ name: "Share Your Work", photos: 8 });
  await page.reload();
  await expect(page.locator(".motion-animation-block[data-animation-id]")).toHaveCount(11);
});

test("the two-column picker fits the mobile inspector and applies motion without exposing keys", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(async () => {
    const manifest = await (await fetch("/templates/motion/share-your-work.json")).json();
    window.musart!.load(manifest.project);
    window.musart!.select([manifest.project.pages[0].layers[0].id]);
  });
  await page
    .locator(".mobile-editor-nav")
    .getByRole("button", { name: "Properties", exact: true })
    .click();
  const section = page.locator(".layer-animations");
  const initialAnimations = await section.locator(".animation-instance").count();
  await section.getByRole("button", { name: "Add motion", exact: true }).click();
  const picker = page.locator(".motion-animation-popover");
  await expect(picker).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = await picker.boundingBox();
      return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390;
    })
    .toBe(true);
  const box = await picker.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeLessThanOrEqual(844);
  await picker.screenshot({ path: "artifacts/motion-actions/mobile-picker.png" });
  await picker.getByRole("button", { name: "Blur", exact: true }).click();
  await picker.getByRole("button", { name: "Focus", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(section.locator(".animation-instance")).toHaveCount(initialAnimations + 1);
  await expect(page.locator(".motion-property-diamond:not([hidden])")).toHaveCount(0);
});
