import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import { fontSurfaceCounters, installFontPickerProfile } from "./support/font-picker-profile";
import { profileClock } from "./support/selection-profile";

async function twoFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function visibleRows(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('[role="listbox"][aria-label="Polices"]');
    if (!list) return 0;
    const area = list.getBoundingClientRect();
    return [...list.querySelectorAll('[role="option"]')].filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > area.top && rect.top < area.bottom;
    }).length;
  });
}

test("font picker native production: cold/warm geometry, typing, scroll and real font work", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const directory = process.env.MUSART_FONT_OUTPUT ?? "artifacts/font-picker-profile/current";
  await mkdir(directory, { recursive: true });
  const errors: string[] = [],
    repairs: { opening: number; at: number; reason: string }[] = [],
    network: { id: string; url: string; timestamp: number; type: string; bytes?: number }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await installFontPickerProfile(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  session.on("Network.responseReceived", (event) => {
    if (/\.(ttf|otf|woff2?)(?:[?#]|$)/i.test(event.response.url))
      network.push({
        id: event.requestId,
        url: event.response.url,
        timestamp: event.timestamp,
        type: event.type,
      });
  });
  session.on("Network.loadingFinished", (event) => {
    const entry = network.find((item) => item.id === event.requestId);
    if (entry) entry.bytes = event.encodedDataLength;
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["font-profile-text"]);
    },
    createProject({
      id: "font-profile-project",
      pages: [
        createPage({
          width: 720,
          height: 420,
          layers: [
            createLayer("text", {
              id: "font-profile-text",
              name: "Typography witness",
              text: "MusArt explore la typographie.",
              x: 40,
              y: 100,
              width: 640,
              height: 200,
              fontFamily: "Raleway",
              fontSize: 64,
            }),
          ],
        }),
      ],
    }),
  );
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
    return data?.rendererReady === "true" && data.renderedRevision === data.sceneRevision;
  });
  await page.evaluate(() => window.musart!.flushThumbnails());
  await page.bringToFront();
  const documentBefore = await page.evaluate(() => window.musart!.snapshot());
  const before = await fontSurfaceCounters(page);
  const clock = await profileClock(session, page);
  const started = await page.evaluate(() => performance.now());
  const trigger = page.getByRole("combobox", { name: "Police", exact: true });
  async function open() {
    await trigger.click();
    await page.waitForFunction(() => Boolean(window.__fontPickerProfile!.opens.at(-1)?.second));
    const opening = await page.evaluate(() => window.__fontPickerProfile!.opens.at(-1)!);
    if (!opening.second?.rows.length) {
      await page.screenshot({
        path: join(
          directory,
          `opening-${await page.evaluate(() => window.__fontPickerProfile!.opens.length)}-blank.png`,
        ),
      });
      const list = page.getByRole("listbox", { name: "Polices", exact: true });
      const area = await list.boundingBox();
      if (!area) throw new Error("Font list did not mount after the observed opening frames.");
      repairs.push({
        opening: await page.evaluate(() => window.__fontPickerProfile!.opens.length),
        at: await page.evaluate(() => performance.now()),
        reason: "No row intersects the initial viewport; explicit native wheel.",
      });
      await page.mouse.move(area.x + area.width - 3, area.y + area.height / 2);
      await page.mouse.wheel(0, 48);
      await twoFrames(page);
    }
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('[role="listbox"] [role="option"]')?.getAttribute("aria-setsize"),
        ) > 1900,
    );
    expect(await visibleRows(page)).toBeGreaterThan(0);
  }
  for (const query of ["Raleway", "Tinos", "Pacifico"]) {
    await open();
    const input = page.getByRole("combobox", { name: "Rechercher une police", exact: true });
    await input.focus();
    await page.keyboard.type(query, { delay: 20 });
    await page.waitForFunction(
      (query) =>
        window.__fontPickerProfile!.inputs.at(-1)?.value === query &&
        Boolean(window.__fontPickerProfile!.inputs.at(-1)?.finalAt),
      query,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Polices", exact: true })).toHaveCount(0);
  }
  await open();
  const list = page.getByRole("listbox", { name: "Polices", exact: true });
  const area = await list.boundingBox();
  if (!area) throw new Error("Font scroll viewport is unavailable.");
  await page.mouse.move(area.x + area.width - 3, area.y + area.height / 2);
  const scrollBefore = await fontSurfaceCounters(page);
  for (let index = 0; index < 16; index++) await page.mouse.wheel(0, index < 8 ? 72 : -72);
  await page.waitForTimeout(100);
  const scrollAfter = await fontSurfaceCounters(page);
  await page.keyboard.press("Escape");
  await twoFrames(page);
  const ended = await page.evaluate(() => performance.now());
  const samples = await page.evaluate(() => window.__fontPickerProfile!);
  const after = await fontSurfaceCounters(page);
  const documentAfter = await page.evaluate(() => window.musart!.snapshot());
  expect(documentAfter.project).toEqual(documentBefore.project);
  expect(documentAfter.revision).toBe(documentBefore.revision);
  expect(after.commits).toEqual(before.commits);
  expect(scrollAfter.commits).toEqual(scrollBefore.commits);
  for (const key of ["gpu", "webgl", "canvas", "videoFrame"] as const)
    expect(after.readbacks[key]).toBe(before.readbacks[key]);
  // A separate, short CPU diagnostic does not contribute to the unprofiled input samples.
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 1000 });
  await session.send("Profiler.start");
  await open();
  await page.keyboard.type("Raleway", { delay: 20 });
  await page.waitForFunction(() => Boolean(window.__fontPickerProfile!.inputs.at(-1)?.finalAt));
  await page.keyboard.press("Escape");
  const { profile } = await session.send("Profiler.stop");
  await session.detach();
  await writeFile(join(directory, "font-picker.cpuprofile"), JSON.stringify(profile));
  const result = {
    sourceSha: process.env.MUSART_FONT_SHA,
    browser: browser.version(),
    viewport: page.viewportSize(),
    clock,
    started,
    ended,
    repairs,
    before,
    after,
    scrollBefore,
    scrollAfter,
    samples,
    network,
    errors,
  };
  await writeFile(join(directory, "font-picker.json"), JSON.stringify(result, null, 2));
  await testInfo.attach("font-picker-profile", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  await page.evaluate(() => window.__fontPickerProfile!.stop?.());
  expect(errors).toEqual([]);
});
