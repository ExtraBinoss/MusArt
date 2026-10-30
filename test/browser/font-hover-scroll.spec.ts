import { test, expect } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
import { fontSurfaceCounters, installFontPickerProfile } from "./support/font-picker-profile";

test("font hover/wheel diagnostic records actual downloads and durable originals", async ({
  page,
}) => {
  const directory = process.env.MUSART_FONT_OUTPUT ?? "artifacts/font-picker-profile/current";
  await mkdir(directory, { recursive: true });
  await installReadbackProbe(page);
  await installFontPickerProfile(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  const session = await page.context().newCDPSession(page);
  const requests: { url: string; at: number }[] = [];
  await session.send("Network.enable");
  session.on("Network.requestWillBeSent", (event) => {
    if (/\.(ttf|otf)(?:[?#]|$)/i.test(event.request.url))
      requests.push({ url: event.request.url, at: event.timestamp });
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["hover-scroll-text"]);
    },
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("text", {
              id: "hover-scroll-text",
              text: "MusArt explore la typographie.",
              fontFamily: "Inter",
              fontSize: 48,
            }),
          ],
        }),
      ],
    }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset
        .rendererReady === "true",
  );
  await page.evaluate(() => window.musart!.flushThumbnails());
  await page.getByRole("combobox", { name: "Police", exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[role="listbox"] [role="option"]')?.getAttribute("aria-setsize"),
      ) > 1900,
  );
  async function originals() {
    return page.evaluate(async () => {
      const databases = await indexedDB.databases();
      if (!databases.some((entry) => entry.name === "musart-font-library"))
        return { files: 0, faces: 0 };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("musart-font-library");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction(["fontFiles", "fontFaces"], "readonly");
        const count = (store: string) =>
          new Promise<number>((resolve, reject) => {
            const request = tx.objectStore(store).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        const [files, faces] = await Promise.all([count("fontFiles"), count("fontFaces")]);
        return { files, faces };
      } finally {
        db.close();
      }
    });
  }
  const documentBefore = await page.evaluate(() => window.musart!.snapshot());
  const before = await fontSurfaceCounters(page),
    storedBefore = await originals(),
    requestStart = requests.length;
  const area = await page.getByRole("listbox", { name: "Polices", exact: true }).boundingBox();
  if (!area) throw new Error("Font viewport is unavailable.");
  const started = await page.evaluate(() => performance.now());
  await page.mouse.move(area.x + area.width * 0.5, area.y + area.height * 0.5);
  for (let index = 0; index < 8; index++) {
    await page.mouse.wheel(0, 44);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(1000);
  const after = await fontSurfaceCounters(page),
    storedAfter = await originals();
  const sample = await page.evaluate(() => window.__fontPickerProfile!);
  const documentAfter = await page.evaluate(() => window.musart!.snapshot());
  expect(documentAfter.project).toEqual(documentBefore.project);
  expect(documentAfter.revision).toBe(documentBefore.revision);
  expect(after.commits).toEqual(before.commits);
  await page.keyboard.press("Escape");
  await writeFile(
    join(directory, "hover-scroll.json"),
    JSON.stringify(
      {
        sourceSha: process.env.MUSART_FONT_SHA,
        started,
        before,
        after,
        storedBefore,
        storedAfter,
        requests: requests.slice(requestStart),
        sample,
      },
      null,
      2,
    ),
  );
  await session.detach();
  await page.evaluate(() => window.__fontPickerProfile!.stop?.());
});
