import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installNativeVideoProbe } from "./support/native-video-probe";
const cohort = resolve("artifacts/video-playback-native");
test("sequential native playback retains one bounded decoder and cancels without draining a long video", async ({
  page,
}) => {
  test.setTimeout(60000);
  await mkdir(cohort, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/video-playback-witness.ts",
      "--target=browser",
      "--outfile",
      resolve(cohort, "witness.js"),
    ],
    { stdio: "pipe" },
  );
  const bundle = await readFile(resolve(cohort, "witness.js"), "utf8");
  await installNativeVideoProbe(page);
  await page.route("**/video-playback-witness.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Native playback cursor witness</title>",
    }),
  );
  await page.route("**/video-playback-witness.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  await page.goto("/video-playback-witness.html");
  const result = await page.evaluate(async () => {
    const url = "/video-playback-witness.js",
      module = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/video-playback-witness");
    return module.runVideoPlaybackWitness();
  });
  await writeFile(resolve(cohort, "report.json"), JSON.stringify(result, null, 2));
  expect(result.before.stats.decodedFrames).toBeLessThan(12);
  expect(result.before.stats.cachedFrames).toBeLessThanOrEqual(2);
  expect(result.after.native).toMatchObject({ decodersOpen: 0, framesOpen: 0 });
  expect(result.after.stats.decoderReservationBytes).toBe(0);
  expect(result.canceled.result).toBe("rejected");
  expect(result.canceled.native).toMatchObject({ decodersOpen: 0, framesOpen: 0 });
  expect(result.canceled.stats.decodedFrames).toBeLessThan(100);
});
