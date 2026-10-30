import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProject } from "@musart/core";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { installReadbackProbe } from "./support/readback-probe";
import { installSearchProfile } from "./support/search-profile";
import { profileClock, visibleThumbnailsReady } from "./support/selection-profile";

test("CmdK diagnostic: first cold opening on genuine 150-layer artwork", async ({
  page,
  browser,
}) => {
  const directory = process.env.MUSART_CMDK_OUTPUT ?? "artifacts/cmdk-profile/current";
  await mkdir(directory, { recursive: true });
  await installReadbackProbe(page);
  await installSearchProfile(page);
  await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let sequence = 0;
  const project = createProject({
    id: "cmdk-afterhours-150",
    name: "AFTERHOURS — 150 editable layers",
    pages: [createTechnoArtboard(() => `cmdk-layer-${++sequence}`)],
  });
  expect(project.pages[0]!.layers).toHaveLength(150);
  await page.evaluate((project) => window.musart!.load(project), project);
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset;
    return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
  });
  await page.evaluate(() => window.musart!.flushThumbnails());
  await visibleThumbnailsReady(page);
  await page.bringToFront();
  const before = await page.evaluate(() => window.musart!.snapshot());
  const session = await page.context().newCDPSession(page);
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 1000 });
  const clock = await profileClock(session, page);
  await session.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline.stack",
    transferMode: "ReturnAsStream",
  });
  await session.send("Profiler.start");
  await page.keyboard.press("Control+k");
  await page.waitForFunction(() => Boolean(window.__searchProfile!.samples[0]?.settledAt));
  const { profile } = await session.send("Profiler.stop");
  const complete = new Promise<{ stream?: string }>((resolve) =>
    session.once("Tracing.tracingComplete", resolve),
  );
  await session.send("Tracing.end");
  const { stream } = await complete;
  if (!stream) throw new Error("The cold diagnostic trace is unavailable.");
  let trace = "";
  for (;;) {
    const chunk = await session.send("IO.read", { handle: stream });
    trace += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString() : chunk.data;
    if (chunk.eof) break;
  }
  await session.send("IO.close", { handle: stream });
  await session.detach();
  const diagnostic = await page.evaluate(() => ({
    sample: window.__searchProfile!.samples[0]!,
    adapter: window.__searchProfile!.adapter,
  }));
  const after = await page.evaluate(() => window.musart!.snapshot());
  expect(after.project).toEqual(before.project);
  expect(after.revision).toBe(before.revision);
  await writeFile(join(directory, "cold-open-150.cpuprofile"), JSON.stringify(profile));
  await writeFile(join(directory, "cold-open-150.trace.json"), trace);
  await writeFile(
    join(directory, "cold-open-150.json"),
    JSON.stringify(
      {
        frozenSha: process.env.MUSART_CMDK_SHA,
        browser: browser.version(),
        diagnosticOnly: true,
        clock,
        ...diagnostic,
      },
      null,
      2,
    ),
  );
  await page.evaluate(() => window.__searchProfile!.stop?.());
});
