import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import shapes from "../../apps/web/src/services/motion/audio/bank/shapes.json" with { type: "json" };
import type { BankReply } from "../../apps/web/src/services/motion/audio/bank/model";
import { installReadbackProbe } from "./support/readback-probe";
import { interactionEnvironment } from "./support/interaction-probe";

interface PcmWitness {
  reported: string;
  digest: string;
  frames: number;
  exactPcm: boolean;
  wav: boolean;
}
interface SourceWitness {
  start: number;
  duration: number;
  energy: number;
}
declare global {
  interface Window {
    __soundBankWitness?: {
      contexts: AudioContext[];
      pcm: Record<string, PcmWitness>;
      workers: number;
      mixers: number;
      decodes: number;
      stops: number;
      starts: SourceWitness[];
      errors: string[];
    };
  }
}

async function installBankWitness(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "dark");
    const witness = {
      contexts: [] as AudioContext[],
      pcm: {} as Record<string, PcmWitness>,
      workers: 0,
      mixers: 0,
      decodes: 0,
      stops: 0,
      starts: [] as SourceWitness[],
      errors: [] as string[],
    };
    window.__soundBankWitness = witness;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes("mixer.worker")) witness.mixers++;
        if (!String(url).includes("bank.worker")) return;
        witness.workers++;
        this.addEventListener("message", (event: MessageEvent<BankReply>) => {
          if (event.data.type === "error") witness.errors.push(event.data.message);
          if (event.data.type !== "pcm") return;
          const value = event.data.value;
          // Inspect the immutable original independently of the worker-reported revision.
          void value.blob
            .arrayBuffer()
            .then(async (bytes) => {
              const wav = new DataView(bytes),
                hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
              let exactPcm = bytes.byteLength === 44 + value.frames * 2;
              for (let index = 0; exactPcm && index < value.frames; index++)
                exactPcm = value.pcm[index] === wav.getInt16(44 + index * 2, true) / 32768;
              witness.pcm[value.preset] = {
                reported: value.revision,
                digest: `sha256:${Array.from(hash, (part) => part.toString(16).padStart(2, "0")).join("")}`,
                frames: value.frames,
                exactPcm,
                wav:
                  wav.getUint32(0, false) === 0x52494646 &&
                  wav.getUint32(8, false) === 0x57415645 &&
                  wav.getUint32(24, true) === 48000 &&
                  wav.getUint16(22, true) === 1 &&
                  wav.getUint16(34, true) === 16,
              };
            })
            .catch((error: unknown) => witness.errors.push(String(error)));
        });
      }
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (...args) {
      witness.decodes++;
      return Reflect.apply(decode, this, args);
    };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      if (!witness.contexts.includes(this)) witness.contexts.push(this);
      const source = Reflect.apply(create, this, args),
        start = source.start,
        stop = source.stop;
      source.start = (...input: Parameters<AudioBufferSourceNode["start"]>) => {
        let energy = 0;
        for (const sample of source.buffer?.getChannelData(0) ?? []) energy += sample * sample;
        witness.starts.push({
          start: input[0] ?? this.currentTime,
          duration: source.buffer?.duration ?? 0,
          energy,
        });
        Reflect.apply(start, source, input);
      };
      source.stop = function (...input: Parameters<AudioBufferSourceNode["stop"]>) {
        witness.stops++;
        return Reflect.apply(stop, this, input);
      };
      return source;
    };
  });
}

/** Reads only captured PNGs on a separate blank page: no production canvas readback. */
async function inspectMountain(inspector: Page, png: Buffer, neutral: string, active: string) {
  return await inspector.evaluate(
    async ({ url, neutral, active }) => {
      if (window.__musartVideoReadbacks)
        throw Error("The screenshot inspector has a production probe.");
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      const color = (value: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const gray = color(neutral),
        green = color(active);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data,
        top: number[] = [],
        bottom: number[] = [];
      let grayPixels = 0,
        greenPixels = 0,
        greenAfter = -1,
        holes = 0;
      const near = (index: number, target: number[]) =>
        target.every((channel, offset) => Math.abs(pixels[index + offset]! - channel) < 35);
      for (let x = 0; x < canvas.width; x++) {
        let first = canvas.height,
          last = -1;
        const filled: number[] = [];
        for (let y = 0; y < canvas.height; y++) {
          const index = (y * canvas.width + x) * 4,
            isGreen = near(index, green),
            isGray = near(index, gray);
          if (isGreen) {
            greenPixels++;
            greenAfter = Math.max(greenAfter, x);
          }
          if (isGray) grayPixels++;
          if (isGreen || isGray) {
            first = Math.min(first, y);
            last = y;
            filled.push(y);
          }
        }
        if (last >= 0) {
          top.push(first);
          bottom.push(last);
          holes += last - first + 1 - filled.length;
        }
      }
      return {
        width: canvas.width,
        height: canvas.height,
        grayPixels,
        greenPixels,
        greenAfter,
        occupiedColumns: top.length,
        minTop: Math.min(...top),
        maxTop: Math.max(...top),
        minBottom: Math.min(...bottom),
        maxBottom: Math.max(...bottom),
        holes,
      };
    },
    { url: `data:image/png;base64,${png.toString("base64")}`, neutral, active },
  );
}

test("prepares fifteen exact originals and paints native-clock bank mountains without production readbacks", async ({
  page,
}) => {
  test.setTimeout(40000);
  await installBankWitness(page);
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  const layer = createLayer("rectangle", {
      id: "bank-card",
      width: 128,
      height: 128,
      fill: "#446688",
    }),
    project = createProject({
      id: crypto.randomUUID(),
      pages: [
        createPage({
          id: "bank-page",
          width: 128,
          height: 128,
          layers: [layer],
          motion: {
            version: 1,
            initialized: true,
            mode: "motion",
            duration: { value: 3, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [
              {
                id: "bank-track",
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
  const canonical = await page.evaluate(() => window.musart!.snapshot().project);
  await page.getByRole("button", { name: "Ajouter un son", exact: true }).click();
  const canvases = page.locator("canvas.motion-sfx-waveform[data-waveform-ready=true]"),
    list = page.locator(".motion-sfx-list");
  await expect.poll(() => canvases.count()).toBeGreaterThan(0);
  expect(await canvases.count()).toBeLessThan(15);
  expect(await page.locator(".motion-sfx-item .motion-sfx-waveform:not(canvas)").count()).toBe(0);
  expect(
    await canvases.evaluateAll((nodes) =>
      nodes.every((node) => node.getBoundingClientRect().height === 16),
    ),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => Object.keys(window.__soundBankWitness!.pcm).length))
    .toBe(15);
  const originals = await page.evaluate(() => window.__soundBankWitness!.pcm);
  for (const shape of shapes.shapes) {
    expect(originals[shape.id], shape.id).toEqual({
      reported: shape.revision,
      digest: shape.revision,
      frames: shape.frames,
      exactPcm: true,
      wav: true,
    });
  }
  const seen = await list.evaluate((node) => ({
    presets: [...node.querySelectorAll<HTMLElement>("[data-preset-id]")].map(
      (row) => row.dataset.presetId!,
    ),
    categories: [...node.querySelectorAll<HTMLElement>("[data-sfx-category]")].map(
      (row) => row.dataset.sfxCategory!,
    ),
  }));
  await list.evaluate((node) => node.scrollTo(0, node.scrollHeight));
  await expect(page.locator('[data-preset-id="low-pulse"]')).toBeVisible();
  const last = await list.evaluate((node) => ({
    presets: [...node.querySelectorAll<HTMLElement>("[data-preset-id]")].map(
      (row) => row.dataset.presetId!,
    ),
    categories: [...node.querySelectorAll<HTMLElement>("[data-sfx-category]")].map(
      (row) => row.dataset.sfxCategory!,
    ),
  }));
  expect([...new Set([...seen.presets, ...last.presets])].sort()).toEqual(
    shapes.shapes.map((shape) => shape.id).sort(),
  );
  expect([...new Set([...seen.categories, ...last.categories])].sort()).toEqual(
    ["whoosh", "impact", "pop", "riser", "tone"].sort(),
  );
  const item = page.locator('.motion-sfx-item[data-preset-id="bright-riser"]'),
    waveform = item.locator("canvas"),
    preview = item.getByRole("button", { name: "Écouter Bright riser", exact: true });
  await preview.scrollIntoViewIfNeeded();
  const header = await page.locator(".motion-audio-library-header strong").boundingBox();
  if (!header) throw Error("The bank header is unavailable.");
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  const palette = await waveform.evaluate((node) => {
    const style = getComputedStyle(node);
    return { neutral: style.color, active: style.outlineColor };
  });
  const before = await waveform.screenshot();
  const startsBeforePlay = await page.evaluate(() => window.__soundBankWitness!.starts.length);
  await preview.hover();
  await page.waitForFunction(
    (count) => window.__soundBankWitness!.starts.length > count,
    startsBeforePlay,
  );
  const frozen = await page.evaluate(async () => {
    const witness = window.__soundBankWitness!,
      context = witness.contexts.at(-1)!,
      source = witness.starts.at(-1)!;
    await new Promise<void>((resolve) => {
      const wait = () => {
        // The riser's actual first third is subpixel at 16px; inspect a visible partial crest.
        if (context.currentTime - source.start >= source.duration * 0.6) resolve();
        else requestAnimationFrame(wait);
      };
      wait();
    });
    await context.suspend();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return {
      elapsed: context.currentTime - source.start,
      duration: source.duration,
      state: context.state,
    };
  });
  expect(frozen.state).toBe("suspended");
  expect(frozen.elapsed / frozen.duration).toBeGreaterThanOrEqual(0.6);
  expect(frozen.elapsed / frozen.duration).toBeLessThan(0.85);
  const partial = await waveform.screenshot();
  const stops = await page.evaluate(() => window.__soundBankWitness!.stops);
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
  await expect
    .poll(() => page.evaluate(() => window.__soundBankWitness!.stops))
    .toBeGreaterThan(stops);
  await expect(item).not.toHaveAttribute("data-preview-active", "true");
  // Restore the initial unfocused background before comparing antialiased edge pixels.
  await preview.evaluate((node) => node.blur());
  const stopped = await waveform.screenshot();
  const inspector = await page.context().newPage();
  let optical: Awaited<ReturnType<typeof inspectMountain>>[];
  try {
    optical = [];
    for (const image of [before, partial, stopped])
      optical.push(await inspectMountain(inspector, image, palette.neutral, palette.active));
  } finally {
    await inspector.close();
  }
  await mkdir("artifacts/motion/audio/bank", { recursive: true });
  await writeFile("artifacts/motion/audio/bank/before.png", before);
  await writeFile("artifacts/motion/audio/bank/partial-suspended.png", partial);
  await writeFile("artifacts/motion/audio/bank/stopped.png", stopped);
  await writeFile(
    "artifacts/motion/audio/bank/optical.json",
    JSON.stringify({ optical, frozen, palette }, null, 2),
  );
  const [gray, green, reset] = optical as [
    (typeof optical)[number],
    (typeof optical)[number],
    (typeof optical)[number],
  ];
  expect(gray.greenPixels).toBe(0);
  expect(gray.grayPixels).toBeGreaterThan(20);
  expect(gray.occupiedColumns).toBeGreaterThan(gray.width * 0.6);
  expect(gray.maxTop - gray.minTop).toBeGreaterThan(1);
  expect(gray.minBottom).toBeGreaterThanOrEqual(gray.height - 2);
  expect(gray.holes).toBeLessThanOrEqual(gray.width * 0.1);
  expect(green.greenPixels).toBeGreaterThan(10);
  expect(green.grayPixels).toBeGreaterThan(10);
  expect(
    Math.abs(green.greenAfter + 1 - (green.width * frozen.elapsed) / frozen.duration),
  ).toBeLessThan(4);
  expect(reset.greenPixels).toBe(0);
  expect(reset.grayPixels).toBe(gray.grayPixels);
  const startsBeforeClose = await page.evaluate(() => window.__soundBankWitness!.starts.length);
  await preview.click();
  await expect
    .poll(() => page.evaluate(() => window.__soundBankWitness!.starts.length))
    .toBeGreaterThan(startsBeforeClose);
  const beforeClose = await page.evaluate(() => window.__soundBankWitness!.stops);
  await page.keyboard.press("Escape");
  await expect(page.locator(".motion-audio-library")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__soundBankWitness!.stops))
    .toBeGreaterThan(beforeClose);
  const evidence = await page.evaluate(() => {
    const w = window.__soundBankWitness!;
    return {
      pcm: w.pcm,
      workers: w.workers,
      mixers: w.mixers,
      decodes: w.decodes,
      stops: w.stops,
      starts: w.starts,
      errors: w.errors,
      readbacks: window.__musartVideoReadbacks,
      project: window.musart!.snapshot().project,
    };
  });
  expect(evidence.workers).toBe(1);
  expect(evidence.mixers).toBe(0);
  expect(evidence.decodes).toBe(0);
  expect(evidence.errors).toEqual([]);
  expect(evidence.starts.every((source) => source.energy > 0)).toBe(true);
  expect(evidence.project).toEqual(canonical);
  expect(evidence.readbacks).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
    canvasHook: true,
  });
  await writeFile(
    "artifacts/motion/audio/bank/native-proof.json",
    JSON.stringify(
      {
        evidence,
        gray,
        green,
        reset,
        frozen,
        environment: await interactionEnvironment(page),
        limits: [
          "Real AudioContext suspension freezes partial progress for optical inspection; this is not a timing benchmark.",
          "Native source scheduling and nonzero PCM establish the browser path, not physical speaker output.",
          "Pixel reads occur only on screenshot-inspector pages; the production page retains its readback probe.",
          "Exact hashes are asserted for this Chrome engine; Firefox/WebKit require their own execution.",
        ],
      },
      null,
      2,
    ),
  );
});
