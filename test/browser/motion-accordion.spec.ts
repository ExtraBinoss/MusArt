import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  MOTION_ANIMATION_PRESETS,
} from "@musart/core";
import type {} from "../../apps/web/src/services/automation/automation";

for (const reduced of [false, true])
  test(`animation disclosures open and close ${reduced ? "without motion when requested" : "with smooth measured height"}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.addInitScript(() => {
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
      localStorage.setItem("musart.language", "en");
    });
    await page.goto("/?automation=1");
    await page.waitForFunction(() => !!window.musart);
    const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            width: 200,
            height: 200,
            layers: [createLayer("rectangle", { id: "subject", width: 80, height: 80 })],
          }),
        ],
      }),
    );
    engine.execute({ type: "setCompositionMode", mode: "motion" });
    const track = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
    engine.execute({
      type: "addMotionAnimation",
      trackId: track.id,
      preset: MOTION_ANIMATION_PRESETS.find((p) => p.id === "scale-blur")!,
      start: { value: 0, rate: 1 },
      duration: { value: 1, rate: 1 },
    });
    await page.evaluate((project) => {
      window.musart!.load(project);
      window.musart!.select(["subject"]);
    }, engine.getSnapshot().project);
    const instance = page.locator(".animation-instance"),
      trigger = instance.locator(".animation-instance-name");
    const revision = await page.evaluate(() => window.musart!.snapshot().revision);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(instance.locator(".animation-instance-body")).toHaveCount(0);
    const content = instance.locator(":scope > .animation-disclosure");
    const measurements = await trigger.evaluate(async (button) => {
      (button as HTMLButtonElement).click();
      const result: number[] = [];
      for (let i = 0; i < 12; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const node = button.closest(".animation-instance")!.querySelector(".animation-disclosure");
        result.push(node?.getBoundingClientRect().height ?? 0);
      }
      const node = button.closest(".animation-instance")!.querySelector(".animation-disclosure")!;
      return {
        values: result,
        full: node.scrollHeight,
        animation: getComputedStyle(node).animationName,
      };
    });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    if (reduced) expect(measurements.animation).toBe("none");
    else
      expect(
        measurements.values.some((height) => height > 0 && height < measurements.full - 1),
      ).toBe(true);
    await expect
      .poll(() =>
        content.evaluate((node) =>
          Math.abs(node.getBoundingClientRect().height - node.scrollHeight),
        ),
      )
      .toBeLessThan(1);
    await expect(instance.getByRole("button", { name: "Reverse", exact: true })).toHaveCount(0);
    await expect(instance.getByRole("button", { name: "Save as preset", exact: true })).toHaveCount(
      0,
    );
    await instance.getByRole("button", { name: "Duplicate animation", exact: true }).hover();
    await expect(
      page.getByRole("tooltip", { name: "Duplicate animation", exact: true }),
    ).toBeVisible();
    await instance.getByRole("button", { name: "More animation actions", exact: true }).click();
    await expect(
      page.getByText("Swap this animation’s start and end.", { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const actionButtons = instance.locator(".animation-instance-actions button");
    await expect(actionButtons.last()).toHaveAccessibleName("More animation actions");
    const details = instance.locator(".animation-details-disclosure"),
      detailsTrigger = details.getByRole("button", { name: "Details", exact: true });
    await expect(details.locator(".animation-details")).toHaveCount(0);
    await detailsTrigger.click();
    await expect(detailsTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(details.locator(".animation-details")).toBeVisible();
    const curve = details.getByRole("combobox", { name: "Easing", exact: true }).first();
    const triggerBox = await curve.boundingBox();
    expect(triggerBox!.height).toBeLessThanOrEqual(28);
    await curve.click();
    const menu = page.locator(".animation-curve-menu");
    const menuBox = await menu.boundingBox();
    expect(menuBox!.width).toBeLessThanOrEqual(triggerBox!.width + 2);
    expect(menuBox!.height).toBeLessThan(140);
    await expect(menu.getByRole("option").first()).toHaveCSS("font-size", "11px");
    if (!reduced) await page.screenshot({ path: test.info().outputPath("compact-easing.png") });
    await page.keyboard.press("Escape");
    await detailsTrigger.click();
    if (!reduced)
      await expect(details.locator(".animation-disclosure")).toHaveAttribute("inert", "");
    await expect(details.locator(".animation-details")).toHaveCount(0);
    await trigger.focus();
    await trigger.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    if (!reduced) await expect(content).toHaveAttribute("aria-hidden", "true");
    await expect(instance.locator(".animation-instance-body")).toHaveCount(0);
    await trigger.press("Enter");
    await trigger.press("Enter");
    await trigger.press("Enter");
    await expect(instance.locator(".animation-instance-body")).toBeVisible();
    expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision);
    await instance.getByRole("button", { name: "Details", exact: true }).click();
    const channel = instance.getByRole("region", { name: "Horizontal scale", exact: true });
    await expect(channel.getByRole("textbox", { name: "Value", exact: true }).first()).toHaveValue(
      "5",
    );
    const explanation = "100% = original size. Smaller shrinks; larger grows.";
    await expect(page.getByText(explanation, { exact: true })).toHaveCount(0);
    const info = channel.getByRole("button", { name: "About Horizontal scale", exact: true });
    await info.focus();
    await expect(page.getByRole("tooltip", { name: explanation, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip", { name: explanation, exact: true })).toHaveCount(0);
    const reveal = await channel
      .getByRole("button", { name: "Add point", exact: true })
      .evaluate(async (button) => {
        (button as HTMLButtonElement).click();
        const samples: { opacity: number; blur: number }[] = [];
        for (let i = 0; i < 10; i++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const point = button
            .closest(".animation-detail-channel")!
            .querySelector('[data-point-at="0.5"]');
          if (point) {
            const style = getComputedStyle(point);
            samples.push({
              opacity: Number(style.opacity),
              blur: Number.parseFloat(style.filter.replace("blur(", "")),
            });
          }
        }
        return samples;
      });
    expect(reveal.length).toBeGreaterThan(0);
    if (reduced)
      expect(reveal.every((sample) => sample.opacity === 1 && sample.blur === 0)).toBe(true);
    else
      expect(
        reveal.some((sample) => sample.opacity > 0 && sample.opacity < 1 && sample.blur > 0),
      ).toBe(true);
    const point = channel.locator('[data-point-at="0.5"]');
    await expect(point).toHaveCSS("filter", "blur(0px)");
    await expect(point.getByRole("textbox", { name: "Value", exact: true })).toHaveValue("52.5");
    await expect(point.getByText("Step 1", { exact: true })).toBeVisible();
    if (!reduced)
      await channel.screenshot({ path: test.info().outputPath("readable-details.png") });
    await point.getByRole("button", { name: "Remove step 1", exact: true }).click();
    await expect(channel.locator(".animation-point")).toHaveCount(2);
  });
