import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  getEffectDefinition,
  isEffectParameterVisible,
} from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { i18n } from "../../apps/web/src/state/i18n";
import "../../apps/web/src/components/properties/effects/messages";
import { readFileSync } from "node:fs";
const receiptMessages = JSON.parse(
  readFileSync("apps/web/src/components/properties/effects/library/receipt/messages.json", "utf8"),
);
for (const language of ["en", "fr"])
  i18n.addResourceBundle(language, "receiptFx", receiptMessages[language]);
import {
  armInteraction,
  installInteractionProbe,
  interactionEnvironment,
  interactionResult,
  releaseInteractionProbe,
  type InteractionSample,
} from "./support/interaction-probe";

const ownerId = "latency-top-photo",
  effectId = "latency-receipt";
const rowSelector = `.layer-row[data-layer-id="${ownerId}"]`;
const receiptSelector = `${rowSelector} [data-attachment-effect-id="${effectId}"]`;
const lockSelector = `${rowSelector} .layer-lock-button`;
const receipt = createEffect("receipt", { id: effectId });
const definition = getEffectDefinition("receipt");
const controls = definition.parameters
  .filter((p) => isEffectParameterVisible(receipt, p))
  .map((p, index) => {
    const label = JSON.stringify(i18n.t(p.labelKey));
    const selector =
      p.kind === "number"
        ? `input[aria-label=${label}]`
        : p.kind === "select"
          ? `button[data-slot="select-trigger"][aria-label=${label}]`
          : p.kind === "boolean"
            ? `button[role="switch"][aria-label=${label}]`
            : `button[aria-label=${label}]`;
    return { key: p.key, selector, index };
  });

async function start(page: Page, name: string) {
  await installInteractionProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const sourceBytes = await readFile("apps/web/public/benchmark/50-waterfall-5.jpg");
  const dataUrl = `data:image/jpeg;base64,${sourceBytes.toString("base64")}`;
  const asset = (id: string) => ({
    id,
    name: "Public waterfall photograph",
    mime: "image/jpeg",
    width: 1280,
    height: 960,
    dataUrl,
  });
  const project = createProject({
    id: `interaction-${name}`,
    assets: {
      "latency-photo-a": asset("latency-photo-a"),
      "latency-photo-b": asset("latency-photo-b"),
    },
    pages: [
      createPage({
        id: "latency-page-a",
        name: "Latency A",
        width: 960,
        height: 720,
        layers: [
          ...Array.from({ length: 148 }, (_, index) =>
            createLayer("rectangle", {
              id: `latency-shape-${String(index).padStart(3, "0")}`,
              x: 16 + (index % 14) * 54,
              y: 16 + Math.floor(index / 14) * 50,
              width: 40,
              height: 35,
              fill: index % 2 ? "#446bba" : "#f09b52",
            }),
          ),
          createLayer("image", {
            id: ownerId,
            name: "Top photographic Receipt",
            x: 620,
            y: 480,
            width: 288,
            height: 216,
            assetId: "latency-photo-a",
            effects: [receipt],
          }),
        ],
      }),
      createPage({
        id: "latency-page-b",
        name: "Latency B",
        width: 960,
        height: 720,
        layers: [
          createLayer("image", {
            id: "latency-other-photo",
            x: 20,
            y: 20,
            width: 640,
            height: 480,
            assetId: "latency-photo-b",
          }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["latency-top-photo"]);
  }, project);
  await page.waitForFunction((id) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      canvas?.dataset.projectId === id &&
      canvas.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  }, project.id);
  // No thumbnail/history flush, GPU-idle wait, portal warmup or test-only pre-render before the cold click.
  return {
    layers: 150,
    shapes: 148,
    images: 2,
    pages: 2,
    publicSource: "benchmark/50-waterfall-5.jpg",
    sourceSHA256: createHash("sha256").update(sourceBytes).digest("hex"),
  };
}
const snapshot = (page: Page) => page.evaluate(() => window.musart!.snapshot());
async function report(
  page: Page,
  name: string,
  fixture: Awaited<ReturnType<typeof start>>,
  samples: InteractionSample[],
  failure?: unknown,
) {
  const environment = await interactionEnvironment(page);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  await mkdir("artifacts/interaction-latency", { recursive: true });
  await writeFile(
    `artifacts/interaction-latency/${name}.json`,
    JSON.stringify(
      {
        fixture,
        environment,
        samples: samples.map((sample, index) => ({
          temperature: index ? "warm" : "cold",
          ...sample,
        })),
        reads,
        failure: failure instanceof Error ? failure.stack : failure,
        boundary:
          "Native generated/dispatch pointerdown clocks to the first RAF observing required DOM; not GPU duration or physical display latency.",
      },
      null,
      2,
    ),
  );
  expect(environment.gpuQueueHook).toBe(true);
  expect(environment.backend).toBe("webgpu");
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, gpuHook: true });
}

test("Lock: cold and repeated native row/Inspector/canvas feedback preserves atomic feedback and one undo", async ({
  page,
}) => {
  const samples: InteractionSample[] = [];
  const fixture = await start(page, "lock");
  let failure: unknown;
  try {
    // Canonical comparisons stay outside all measured RAFs.
    const before = await snapshot(page);
    expect(before.project.pages).toHaveLength(2);
    expect(before.project.pages.reduce((count, current) => count + current.layers.length, 0)).toBe(
      150,
    );
    expect(Object.keys(before.project.assets)).toHaveLength(2);
    for (let index = 0; index < 5; index++) {
      const revision = index ? (await snapshot(page)).revision : before.revision;
      await armInteraction(page, { kind: "lock", trigger: lockSelector, layerId: ownerId });
      await page.locator(lockSelector).click();
      const sample = await interactionResult(page);
      samples.push(sample);
      expect(sample.afterCommits[".inspector"]).toBeGreaterThan(
        sample.beforeCommits[".inspector"]!,
      );
      await expect(
        page.locator(`${rowSelector}[data-locked="true"] .layer-lock-label`),
      ).toBeVisible();
      await expect(page.locator(".inspector .locked-layer-notice")).toBeVisible();
      await expect(
        page.locator(`.canvas-selection[data-layer-id="${ownerId}"] .canvas-layer-lock`),
      ).toBeVisible();
      const changed = await snapshot(page);
      expect(changed.revision).toBe(revision + 1);
      expect(changed.project.pages[0]!.layers.at(-1)!.locked).toBe(true);
      if (!index) {
        await mkdir("artifacts/interaction-latency", { recursive: true });
        await page.screenshot({ path: "artifacts/interaction-latency/lock-cold.png" });
      }
      await page.getByRole("button", { name: i18n.t("undo"), exact: true }).click();
      expect((await snapshot(page)).project).toEqual(before.project);
      expect((await snapshot(page)).canUndo).toBe(false);
    }
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      await report(page, "lock", fixture, samples, failure);
    } finally {
      await releaseInteractionProbe(page);
    }
  }
});

test("Receipt: its visible parameter window is immediate and no GPU queue work enters native panel presentation", async ({
  page,
}) => {
  const samples: InteractionSample[] = [];
  const fixture = await start(page, "receipt");
  let failure: unknown;
  try {
    expect(controls).toHaveLength(33);
    const trigger = page.locator(receiptSelector),
      popup = page.locator(".layer-attachment-popover");
    const before = await snapshot(page);
    expect(before.project.pages.reduce((count, current) => count + current.layers.length, 0)).toBe(
      150,
    );
    for (let index = 0; index < 5; index++) {
      await armInteraction(page, {
        kind: "receipt",
        trigger: receiptSelector,
        layerId: ownerId,
        controls,
      });
      await trigger.click();
      const sample = await interactionResult(page);
      samples.push(sample);
      expect(sample.firstReadyControls).toMatchObject({
        total: 33,
        missingMounted: [],
        placeholders: 0,
      });
      expect(sample.firstReadyControls!.mounted).toBeGreaterThanOrEqual(10);
      expect(sample.firstReadyControls!.mounted).toBeLessThanOrEqual(16);
      expect(sample.focusInside).toBe(true);
      expect(sample.submissionsBeforeReady).toEqual([]);
      expect(sample.submissionsThroughSettled).toEqual([]);
      const motion = await popup.evaluate((node) => ({
        name: getComputedStyle(node).animationName,
        duration: getComputedStyle(node).animationDuration,
      }));
      expect(motion.name).not.toBe("none");
      expect(Number.parseFloat(motion.duration)).toBeGreaterThan(0);
      expect((await snapshot(page)).project).toEqual(before.project);
      if (!index) {
        await mkdir("artifacts/interaction-latency", { recursive: true });
        await page.screenshot({ path: "artifacts/interaction-latency/receipt-cold.png" });
      }
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    await trigger.click();
    const exposure = popup.getByRole("textbox", {
      name: i18n.t("receiptFx:parameter.exposure"),
      exact: true,
    });
    await exposure.fill("0.2");
    await exposure.press("Tab");
    expect((await snapshot(page)).revision).toBe(before.revision + 1);
    expect(
      (await snapshot(page)).project.pages[0]!.layers.at(-1)!.effects[0]!.settings!.exposure,
    ).toBe(0.2);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await page.getByRole("button", { name: i18n.t("undo"), exact: true }).click();
    expect((await snapshot(page)).project).toEqual(before.project);
    expect((await snapshot(page)).canUndo).toBe(false);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      await report(page, "receipt", fixture, samples, failure);
    } finally {
      await releaseInteractionProbe(page);
    }
  }
});
