import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import type {} from "../../apps/web/src/services/automation/automation";

test("one editable text gets a live typography preset and simple reversible letter controls", async ({
  page,
}) => {
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
          width: 480,
          height: 260,
          background: "#111232",
          layers: [
            createLayer("text", {
              id: "title",
              text: "MORPH",
              x: 20,
              y: 20,
              width: 440,
              height: 220,
              fontFamily: "Inter Variable",
              fontSize: 54,
              fontWeight: 800,
              fill: "#00b9fc",
              textAlign: "center",
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["title"]);
  }, engine.getSnapshot().project);
  const inspector = page.locator(".layer-animations");
  await inspector.getByRole("button", { name: "Add motion", exact: true }).click();
  const picker = page.locator(".motion-animation-popover");
  await picker.getByRole("button", { name: "Typography", exact: true }).click();
  await expect(picker.locator(".animation-preset-card")).toHaveCount(3);
  await picker.getByRole("button", { name: "Inflate", exact: true }).hover();
  await expect
    .poll(async () => Number(await picker.locator("canvas").getAttribute("data-preview-frames")))
    .toBeGreaterThan(1);
  await picker.getByRole("button", { name: "Inflate", exact: true }).click();
  const card = inspector.locator(".animation-instance");
  await expect(card.getByRole("textbox", { name: "Intensity", exact: true })).toHaveValue("65");
  const before = await page.evaluate(() => window.musart!.snapshot().revision);
  const stagger = card.getByRole("textbox", { name: "Stagger", exact: true });
  await stagger.fill("25");
  await stagger.press("Enter");
  await expect.poll(() => page.evaluate(() => window.musart!.snapshot().revision)).toBe(before + 1);
  const edited = await page.evaluate(() => window.musart!.snapshot());
  expect(edited.revision).toBe(before + 1);
  expect(edited.project.pages[0]!.layers).toHaveLength(1);
  expect(edited.project.pages[0]!.layers[0]!.effects[0]!.settings!.stagger).toBe(0.25);
  await page.evaluate(() => window.musart!.undo());
  await expect(stagger).toHaveValue("45");
  await card.getByRole("button", { name: "More animation actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save as preset", exact: true }).click();
  await card.getByRole("textbox", { name: "Preset name", exact: true }).fill("My letter inflate");
  await card.getByRole("button", { name: "Save as preset", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("Saved");
  await inspector.getByRole("button", { name: "Add motion", exact: true }).click();
  await picker.getByRole("radio", { name: "My presets", exact: true }).click();
  await expect(
    picker.getByRole("button", { name: "My letter inflate", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    window.musart!.execute({ type: "updateLayers", ids: ["title"], patch: { text: "HELLO" } }),
  );
  await expect(inspector.locator(".animation-instance")).toHaveCount(1);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.text),
  ).toBe("HELLO");
});
