import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Effect } from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { densityEnvironment } from "./support/effect-density";
import { zoomViewport } from "./support/viewport";

test.use({ deviceScaleFactor: 1.25 });
const methods = ["threshold", "bayer2", "bayer4", "bayer8", "interleaved"] as const;
async function pixels(inspector: Page, baseline: string, candidate: string, oracle?: string) {
  return inspector.evaluate(
    async ({ baseline, candidate, oracle }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          data: context.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const a = await decode(baseline),
        b = await decode(candidate);
      if (a.width !== b.width || a.height !== b.height) throw Error("Dither size mismatch.");
      // Explicit canonical Bayer ranks, independent of MusArt's TSL builders.
      const matrices: Record<string, number[]> = {
        bayer2: [0, 2, 3, 1],
        bayer4: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
        bayer8: [
          0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38,
          60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57,
          25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
        ],
      };
      const colors = new Set<string>(),
        alpha = new Set<number>();
      let alphaMax = 0,
        different = 0,
        opaqueMax = 0,
        invertMax = 0,
        oracleErrors = 0,
        checked = 0,
        excluded = 0,
        hash = 2166136261;
      const fract = (value: number) => value - Math.floor(value);
      for (let i = 0; i < b.data.length; i += 4) {
        alpha.add(b.data[i + 3]!);
        alphaMax = Math.max(alphaMax, Math.abs(a.data[i + 3]! - b.data[i + 3]!));
        if (b.data[i + 3] === 255) colors.add(`${b.data[i]},${b.data[i + 1]},${b.data[i + 2]}`);
        for (let c = 0; c < 4; c++) {
          const error = Math.abs(a.data[i + c]! - b.data[i + c]!);
          different += Number(error !== 0);
          hash = Math.imul(hash ^ b.data[i + c]!, 16777619);
          if (c < 3 && a.data[i + 3] === 255 && b.data[i + 3] === 255) {
            opaqueMax = Math.max(opaqueMax, error);
            invertMax = Math.max(invertMax, Math.abs(a.data[i + c]! + b.data[i + c]! - 255));
          }
        }
        if (!oracle) continue;
        const index = i / 4,
          x = index % a.width,
          y = Math.floor(index / a.width);
        const matrix = matrices[oracle],
          order = matrix ? Math.sqrt(matrix.length) : 1;
        const threshold = matrix
          ? (matrix[(y % order) * order + (x % order)]! + 0.5) / matrix.length
          : oracle === "interleaved"
            ? fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y))
            : 0.5;
        const tone =
          (a.data[i]! * 0.2126 + a.data[i + 1]! * 0.7152 + a.data[i + 2]! * 0.0722) / 255;
        // IGN's floating dot/fract can differ near a discontinuous bit boundary.
        // Record those samples explicitly; fixed/Bayer maps have no exclusions.
        if (oracle === "interleaved" && Math.abs(tone - threshold) < 0.001) {
          excluded++;
          continue;
        }
        const expected = tone >= threshold ? 255 : 0;
        checked++;
        if (
          b.data[i] !== expected ||
          b.data[i + 1] !== expected ||
          b.data[i + 2] !== expected ||
          b.data[i + 3] !== 255
        )
          oracleErrors++;
      }
      return {
        size: [b.width, b.height],
        alphaMax,
        alphaLevels: alpha.size,
        colors: [...colors].sort(),
        different,
        opaqueMax,
        invertMax,
        oracleErrors,
        checked,
        excluded,
        hash: hash >>> 0,
      };
    },
    { baseline, candidate, oracle },
  );
}
async function ready(page: Page, projectId: string, previous: number, scale?: number) {
  await page.waitForFunction(
    ({ projectId, previous, scale }) => {
      const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        d?.projectId === projectId &&
        d.rendererReady === "true" &&
        d.sceneRevision === d.renderedRevision &&
        Number(d.sceneRevision) > previous &&
        (scale === undefined || Number(d.renderWidth) === 128 * scale)
      );
    },
    { projectId, previous, scale },
  );
}
for (const forceWebGL of [false, true])
  test(`One-bit Dither: five photo methods, independent ramp oracle, palette/alpha and fractional export (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    if (forceWebGL) {
      await installWebGLFrameSnapshot(page);
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    }
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const inspector = await page.context().newPage();
    const sources = await inspector.evaluate(
      async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d")!;
        context.save();
        context.beginPath();
        context.roundRect(0, 0, 128, 128, 12);
        context.clip();
        context.drawImage(image, 0, 0, 128, 128);
        context.globalCompositeOperation = "destination-in";
        const alpha = context.createLinearGradient(0, 0, 0, 128);
        alpha.addColorStop(0, "white");
        alpha.addColorStop(0.5, "white");
        alpha.addColorStop(1, "#ffffff40");
        context.fillStyle = alpha;
        context.fillRect(0, 0, 128, 128);
        context.restore();
        const photo = canvas.toDataURL("image/png");
        context.clearRect(0, 0, 128, 128);
        for (let x = 0; x < 128; x++) {
          const gray = Math.round((x * 255) / 127);
          context.fillStyle = `rgb(${gray},${gray},${gray})`;
          context.fillRect(x, 0, 1, 128);
        }
        return { photo, ramp: canvas.toDataURL("image/png") };
      },
      `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`,
    );
    await page.bringToFront();
    const key = forceWebGL ? "webgl" : "webgpu",
      base = createEffect("bit-dither", { seed: 0 });
    await mkdir("artifacts/bit-dither", { recursive: true });
    const images: Record<string, string> = {};
    const save = async (name: string, url: string) => {
      images[name] = url;
      await writeFile(
        `artifacts/bit-dither/${key}-${name}.png`,
        Buffer.from(url.split(",")[1]!, "base64"),
      );
    };
    let currentId = "";
    const load = async (effect: Effect | null, kind: "photo" | "ramp" = "photo") => {
      currentId = `bit-dither-${key}-${kind}`;
      const project = createProject({
        id: currentId,
        assets: {
          source: {
            id: "source",
            name: kind,
            mime: "image/png",
            width: 128,
            height: 128,
            dataUrl: sources[kind],
          },
        },
        pages: [
          createPage({
            id: "bit-page",
            width: 128,
            height: 128,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "bit-image",
                assetId: "source",
                x: 0,
                y: 0,
                width: 128,
                height: 128,
                effects: effect ? [effect] : [],
              }),
            ],
          }),
        ],
      });
      const previous = await page.evaluate((project) => {
        const previous = Number(
          document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
            .sceneRevision ?? 0,
        );
        window.musart!.load(project);
        window.musart!.select(["bit-image"]);
        return previous;
      }, project);
      await ready(page, currentId, previous);
    };
    const png = (scale = 1) =>
      page.evaluate((options) => window.musart!.render(options), {
        format: "png" as const,
        forceWebGL,
        scale,
      });
    try {
      await load(null);
      const photo = await png();
      await save("photo", photo);
      const witnesses: Record<string, Awaited<ReturnType<typeof pixels>>> = {};
      const hashes = new Set<number>();
      for (const method of methods) {
        await load({ ...base, settings: { ...base.settings, method } });
        const url = await png();
        await save(method, url);
        const witness = await pixels(inspector, photo, url);
        witnesses[method] = witness;
        hashes.add(witness.hash);
        expect(witness.alphaMax, method).toBe(0);
        expect(witness.alphaLevels, method).toBeGreaterThan(32);
        expect(witness.colors, method).toEqual(["0,0,0", "255,255,255"]);
        expect((await pixels(inspector, url, await png())).different, method).toBe(0);
      }
      expect(hashes.size).toBe(5);
      await load({ ...base, settings: { ...base.settings, invert: true } });
      expect((await pixels(inspector, images.bayer4!, await png())).invertMax).toBe(0);
      await load({
        ...base,
        settings: { ...base.settings, foreground: "#36114d", background: "#f3eec0" },
      });
      const palette = await png();
      await save("palette", palette);
      expect((await pixels(inspector, photo, palette)).colors).toEqual(["243,238,192", "54,17,77"]);
      await load({ ...base, amount: 0 });
      const zero = await pixels(inspector, photo, await png());
      expect(zero.alphaMax).toBe(0);
      expect(zero.opaqueMax).toBeLessThanOrEqual(1);
      for (const method of methods) {
        await load({ ...base, settings: { ...base.settings, method, strength: 0 } });
        expect((await pixels(inspector, images.threshold!, await png())).different, method).toBe(0);
      }
      await load({
        ...base,
        seed: 1073741824,
        settings: { ...base.settings, method: "interleaved" },
      });
      expect((await pixels(inspector, images.interleaved!, await png())).different).toBeGreaterThan(
        100,
      );
      await load({ ...base, settings: { ...base.settings, gamma: 0.7, contrast: 2 } });
      expect((await pixels(inspector, images.bayer4!, await png())).different).toBeGreaterThan(100);
      await load({ ...base, scale: 8 });
      const cells = await png();
      await save("cells", cells);
      expect((await pixels(inspector, photo, cells)).alphaMax).toBe(0);
      const densities = [];
      for (const [zoom, scale] of [
        [0.5, 0.625],
        [0.8, 1],
        [1.2, 2],
      ] as const) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(page, currentId, -1, scale);
        const live = forceWebGL
          ? (await nativeWebGLFrame(page, currentId)).dataUrl
          : await page
              .locator(".editor-gpu-scene canvas")
              .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
        const metrics = await pixels(inspector, await png(scale), live);
        expect(metrics.size).toEqual([128 * scale, 128 * scale]);
        expect(metrics.different).toBe(0);
        densities.push({ zoom, physicalDensity: zoom * 1.25, backingScale: scale, metrics });
      }
      await load(null, "ramp");
      const ramp = await png();
      const oracles: Record<string, unknown> = {};
      for (const method of methods) {
        await load({ ...base, settings: { ...base.settings, method } }, "ramp");
        const url = await png();
        await save(`ramp-${method}`, url);
        const metrics = await pixels(inspector, ramp, url, method);
        oracles[method] = metrics;
        expect(metrics.oracleErrors, method).toBe(0);
        expect(metrics.checked, method).toBeGreaterThan(128 * 128 * 0.99);
        if (method !== "interleaved") expect(metrics.excluded, method).toBe(0);
      }
      const sheet = await inspector.evaluate(
        async (entries) => {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 444;
          const context = canvas.getContext("2d")!;
          context.fillStyle = "#363636";
          context.fillRect(0, 0, 512, 444);
          for (const [i, [name, url]] of entries.entries()) {
            const image = new Image();
            image.src = url;
            await image.decode();
            const x = (i % 4) * 128,
              y = Math.floor(i / 4) * 148;
            context.drawImage(image, x, y);
            context.fillStyle = "white";
            context.font = "12px sans-serif";
            context.fillText(name, x + 4, y + 143);
          }
          return canvas.toDataURL("image/png");
        },
        Object.entries(images).filter(([name]) => name !== "cells"),
      );
      await save("contact-sheet", sheet);
      const environment = await densityEnvironment(page);
      expect(environment.backend).toBe(key);
      expect(environment.dpr).toBe(1.25);
      expect(errors).toEqual([]);
      expect({
        gpu: environment.reads.gpu,
        webgl: environment.reads.webgl,
        canvas: environment.reads.canvas,
      }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
      await writeFile(
        `artifacts/bit-dither/${key}.json`,
        JSON.stringify(
          {
            boundary:
              "Real photograph/alpha; five deterministic two-color modes; independent explicit Bayer/threshold ramp ranks, IGN CPU oracle excluding only predeclared <.001 floating-boundary samples; exact live/export at matched backing density; validation page excluded from production readback probes.",
            witnesses,
            zero,
            densities,
            oracles,
            environment,
            errors,
          },
          null,
          2,
        ),
      );
    } finally {
      if (forceWebGL) await page.evaluate(() => window.__stopLiveWebGLSnapshot?.());
      await inspector.close();
    }
  });
