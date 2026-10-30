import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { sfxWav, synthesizeSfx } from "../../apps/web/src/services/motion/audio/sfx";
import { installReadbackProbe } from "./support/readback-probe";
import { interactionEnvironment } from "./support/interaction-probe";

declare global {
  interface Window {
    __musartAudioWitness?: {
      starts: number;
      energy: number;
      frames: number;
      running: boolean;
      disconnected: number;
      mixers: number;
      mainDecodes: number;
      stops: number;
    };
  }
}
test("imports a real standalone WAV, prepares a bounded waveform and schedules audible native playback", async ({
  page,
}) => {
  test.setTimeout(40000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
    const witness = {
      starts: 0,
      energy: 0,
      frames: 0,
      running: false,
      disconnected: 0,
      mixers: 0,
      mainDecodes: 0,
      stops: 0,
    };
    window.__musartAudioWitness = witness;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes("mixer.worker")) witness.mixers++;
      }
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (
      ...args: Parameters<AudioContext["decodeAudioData"]>
    ) {
      witness.mainDecodes++;
      return Reflect.apply(decode, this, args);
    };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = Reflect.apply(create, this, args),
        start = source.start,
        disconnect = source.disconnect,
        stop = source.stop;
      source.start = (...input: Parameters<AudioBufferSourceNode["start"]>) => {
        witness.starts++;
        witness.running ||= this.state === "running";
        if (source.buffer) {
          const pcm = source.buffer.getChannelData(0);
          witness.frames += pcm.length;
          for (const value of pcm) witness.energy += value * value;
        }
        Reflect.apply(start, source, input);
      };
      source.stop = function (...args: Parameters<AudioBufferSourceNode["stop"]>) {
        witness.stops++;
        return Reflect.apply(stop, this, args);
      };
      source.disconnect = function () {
        witness.disconnected++;
        Reflect.apply(disconnect, this, []);
      };
      return source;
    };
  });
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  const layer = createLayer("rectangle", {
    id: "audio-card",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    fill: "#446688",
  });
  const project = createProject({
    id: crypto.randomUUID(),
    pages: [
      createPage({
        id: "audio-page",
        width: 64,
        height: 64,
        layers: [layer],
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 30, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "audio-card-track",
              layerId: layer.id,
              start: { value: 0, rate: 1 },
              end: null,
              properties: [],
            },
          ],
        },
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Ajouter un son", exact: true }).click();
  const wav = sfxWav(synthesizeSfx("gentle-riser"));
  await page.locator('input[type="file"][accept="audio/*"]').setInputFiles({
    name: "Real riser.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from(await wav.arrayBuffer()),
  });
  const row = page.locator(".motion-audio-row");
  await expect(row).toHaveCount(1);
  await expect
    .poll(() => row.locator(".motion-audio-waveform path").first().getAttribute("d"))
    .not.toBe("");
  const canonical = await page.evaluate(() => window.musart!.snapshot());
  expect(canonical.project.pages[0]!.layers).toHaveLength(1);
  expect(canonical.project.pages[0]!.motion!.audioTracks).toHaveLength(1);
  await page.getByRole("button", { name: "Lire", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__musartAudioWitness!.energy))
    .toBeGreaterThan(0);
  const beforeVolume = await page.evaluate(() => ({
    snapshot: window.musart!.snapshot(),
    mixers: window.__musartAudioWitness!.mixers,
  }));
  await row.getByRole("button", { name: "Volume", exact: true }).click();
  const popup = page.locator(".motion-audio-volume"),
    slider = popup.getByRole("slider", { name: "Volume", exact: true });
  await expect(slider).toHaveAttribute("aria-valuemin", "0");
  await expect(slider).toHaveAttribute("aria-valuemax", "100");
  const input = popup.getByRole("spinbutton");
  await input.fill("25");
  await expect(slider).toHaveAttribute("aria-valuenow", "25");
  expect((await page.evaluate(() => window.musart!.snapshot())).revision).toBe(
    beforeVolume.snapshot.revision,
  );
  await input.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.musart!.snapshot().project.pages[0]!.motion!.audioTracks![0]!.volume,
      ),
    )
    .toBe(0.25);
  await expect(popup).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  const afterVolume = await page.evaluate(() => ({
    snapshot: window.musart!.snapshot(),
    mixers: window.__musartAudioWitness!.mixers,
  }));
  expect(afterVolume.snapshot.revision).toBe(beforeVolume.snapshot.revision + 1);
  expect(afterVolume.mixers).toBe(beforeVolume.mixers);
  expect(afterVolume.mixers).toBe(1);
  await page.evaluate(() => window.musart!.undo());
  await expect
    .poll(() =>
      page.evaluate(
        () => window.musart!.snapshot().project.pages[0]!.motion!.audioTracks![0]!.volume,
      ),
    )
    .toBe(1);
  await expect(popup).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__musartAudioWitness!.mixers)).toBe(beforeVolume.mixers);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.evaluate(() => window.musart!.flush());
  await expect(page.getByRole("alert")).toHaveCount(0);
  const evidence = await page.evaluate(() => ({
    audio: window.__musartAudioWitness,
    readbacks: window.__musartVideoReadbacks,
    rows: document.querySelectorAll(".motion-audio-row").length,
    waveformPaths: document.querySelectorAll(".motion-audio-waveform path").length,
    snapshot: window.musart!.snapshot(),
  }));
  expect(evidence.audio!.running).toBe(true);
  expect(evidence.audio!.energy).toBeGreaterThan(0.01);
  expect(evidence.audio!.frames).toBeGreaterThan(0);
  expect(evidence.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  expect(evidence.snapshot.project).toEqual(canonical.project);
  const environment = await interactionEnvironment(page);
  await mkdir("artifacts/motion/audio", { recursive: true });
  await writeFile(
    "artifacts/motion/audio/ui-playback.json",
    JSON.stringify({ ...evidence, environment, beforeVolume, afterVolume }, null, 2),
  );
  await page.screenshot({ path: "artifacts/motion/audio/ui-playback.png" });
  await page.getByRole("button", { name: "Ajouter un son", exact: true }).click();
  const previewButton = page.getByRole("button", { name: "Écouter Bright riser", exact: true });
  await page.locator(".motion-sfx-list").evaluate((node) => node.scrollTo(0, node.scrollHeight));
  await previewButton.scrollIntoViewIfNeeded();
  const bankHeader = await page.locator(".motion-audio-library-header strong").boundingBox();
  if (!bankHeader) throw Error("The sound bank has no visible header.");
  const hoverBefore = await page.evaluate(() => ({ ...window.__musartAudioWitness! }));
  await previewButton.hover();
  await expect
    .poll(() => page.evaluate(() => window.__musartAudioWitness!.starts))
    .toBeGreaterThan(hoverBefore.starts);
  await expect(
    page.locator('canvas.motion-sfx-waveform[data-waveform-ready="true"]').first(),
  ).toBeVisible();
  const playingHover = await page.evaluate(() => ({ ...window.__musartAudioWitness! }));
  expect(playingHover.energy).toBeGreaterThan(hoverBefore.energy);
  expect(playingHover.mainDecodes).toBe(0);
  // Native capture can outlast this 1.8s one-shot. Leave before capturing pixels,
  // so the assertion actually tests an interrupted sound rather than a finished one.
  await page.mouse.move(bankHeader.x + bankHeader.width / 2, bankHeader.y + bankHeader.height / 2);
  await expect
    .poll(() => page.evaluate(() => window.__musartAudioWitness!.stops))
    .toBeGreaterThan(playingHover.stops);
  await page.screenshot({ path: "artifacts/motion/audio/bank-after-stop.png" });
  const hoverEvidence = await page.evaluate(() => ({
    audio: window.__musartAudioWitness,
    readbacks: window.__musartVideoReadbacks,
    snapshot: window.musart!.snapshot(),
  }));
  expect(hoverEvidence.snapshot.project).toEqual(canonical.project);
  expect(hoverEvidence.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await writeFile(
    "artifacts/motion/audio/hover-preview.json",
    JSON.stringify(hoverEvidence, null, 2),
  );
});
