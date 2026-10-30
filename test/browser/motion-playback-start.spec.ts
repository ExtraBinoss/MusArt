import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { prepareAudioPlaybackWitness } from "./support/audio-playback-witness";

declare global {
  interface Window {
    __avPlayback?: Awaited<ReturnType<typeof prepareAudioPlaybackWitness>>;
  }
}

test("cold audio/video playback preserves the first attack, ignores future originals and closes native resources", async ({
  page,
}, info) => {
  const folder = resolve("artifacts/motion/audio-start-native");
  await mkdir(folder, { recursive: true });
  for (const [source, name] of [
    ["test/browser/support/audio-playback-witness.ts", "witness.js"],
    ["apps/web/src/services/motion/audio/mixer.worker.ts", "mixer.worker.js"],
  ] as const)
    execFileSync(
      "bun",
      [
        "build",
        source,
        "--target=browser",
        "--sourcemap=inline",
        "--outfile",
        resolve(folder, name),
      ],
      { stdio: "pipe" },
    );
  const [witness, worker] = await Promise.all([
    readFile(resolve(folder, "witness.js"), "utf8"),
    readFile(resolve(folder, "mixer.worker.js"), "utf8"),
  ]);
  await page.route("**/audio-playback-witness.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Audio/video startup witness</title>",
    }),
  );
  await page.route("**/audio-playback-witness.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: witness }),
  );
  await page.route("**/mixer.worker.ts", (route) =>
    route.fulfill({ contentType: "text/javascript", body: worker }),
  );
  await page.goto("/audio-playback-witness.html");
  await page.evaluate(async () => {
    const url = "/audio-playback-witness.js";
    const module = (await import(
      /* @vite-ignore */ url
    )) as typeof import("./support/audio-playback-witness");
    window.__avPlayback = await module.prepareAudioPlaybackWitness(40);
  });
  await page.getByRole("button", { name: "Play AV witness", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__avPlayback!.read().heard)).not.toBeNull();
  const result = await page.evaluate(() => window.__avPlayback!.read());
  const closed = await page.evaluate(() => window.__avPlayback!.close());
  await writeFile(info.outputPath("startup.json"), JSON.stringify({ result, closed }, null, 2));
  expect(result.errors).toEqual([]);
  expect(result.starts[0]).toMatchObject({ timeline: 0, offset: 0, nonzero: true });
  expect(result.blocks[0]?.start).toBe(0);
  expect(
    result.reads
      .filter((read) => read.at <= result.starts[0]!.wall)
      .map((read) => read.assetId)
      .sort(),
  ).toEqual(["movie", "sound-0"]);
  expect(
    result.frames
      .filter((frame) => frame.wall <= result.starts[0]!.wall)
      .every((frame) => frame.time === 0),
  ).toBe(true);
  expect(result.heard!.amplitude).not.toBe(0);
  expect(result.peakNodes).toBeLessThanOrEqual(4);
  expect(result.canonicalUnchanged).toBe(true);
  expect(closed.activeNodes).toBe(0);
  expect(closed.video).toMatchObject({
    cachedFrames: 0,
    borrowedFrames: 0,
    accountedFrameBytes: 0,
    decoderReservationBytes: 0,
    closed: true,
  });
});
