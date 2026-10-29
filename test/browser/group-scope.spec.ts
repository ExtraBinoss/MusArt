import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  layerTransform,
  selectionComposition,
  type Asset,
  type Composition,
  type Layer,
} from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { densityEnvironment } from "./support/effect-density";
import { imageDifference } from "./support/photographic-effect";
import { inspectImage } from "./support/image-probe";

async function premultipliedDifference(inspector: Page, reference: string, candidate: string) {
  return inspector.evaluate(
    async ({ reference, candidate }) => {
      const decode = async (url: string) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        return {
          width: c.width,
          height: c.height,
          data: ctx.getImageData(0, 0, c.width, c.height).data,
        };
      };
      const a = await decode(reference),
        b = await decode(candidate);
      if (a.width !== b.width || a.height !== b.height)
        throw new Error("Native scope dimensions differ");
      let max = 0,
        alphaMax = 0,
        covered = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const aa = a.data[i + 3]!,
          ba = b.data[i + 3]!;
        covered += Number(ba > 0);
        alphaMax = Math.max(alphaMax, Math.abs(aa - ba));
        for (let c = 0; c < 3; c++)
          max = Math.max(max, Math.abs((a.data[i + c]! * aa) / 255 - (b.data[i + c]! * ba) / 255));
      }
      return { max, alphaMax, covered, dimensions: [a.width, a.height] };
    },
    { reference, candidate },
  );
}
async function pixelProbe(inspector: Page, source: string, clipped = false) {
  return inspector.evaluate(
    async ({ source, clipped }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const p = ctx.getImageData(0, 0, c.width, c.height).data;
      const alphas = [
        ...new Set(Array.from({ length: c.width * c.height }, (_, i) => p[i * 4 + 3]!)),
      ];
      let outsideAlpha = 0;
      if (clipped)
        for (let y = 0; y < c.height; y++)
          for (let x = 8; x < c.width; x++)
            outsideAlpha = Math.max(outsideAlpha, p[(y * c.width + x) * 4 + 3]!);
      return {
        alphas,
        outsideAlpha,
        center: Array.from(
          p.subarray(
            (Math.floor(c.height / 2) * c.width + Math.floor(c.width / 2)) * 4,
            (Math.floor(c.height / 2) * c.width + Math.floor(c.width / 2)) * 4 + 4,
          ),
        ),
      };
    },
    { source, clipped },
  );
}
for (const forceWebGL of [false, true])
  test(`tiny selected content under giant transport ancestors keeps its authored treatment domain (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const key = forceWebGL ? "webgl" : "webgpu",
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    if (forceWebGL)
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const inspection = await page.context().newPage();
    await page.bringToFront();
    let sequence = 0;
    const render = async (
      composition: Composition,
      assets: Record<string, Asset> = {},
      scale = 8,
    ) => {
      const project = createProject({
        id: `scope-${key}-${++sequence}`,
        pages: [composition],
        assets,
      });
      await page.evaluate((project) => window.musart!.load(project), project);
      return page.evaluate((options) => window.musart!.render(options), {
        format: "png" as const,
        scale,
        forceWebGL,
      });
    };
    const save = (name: string, url: string) =>
      writeFile(
        `artifacts/group-scope/${key}-${name}.png`,
        Buffer.from(url.split(",")[1]!, "base64"),
      );
    await mkdir("artifacts/group-scope", { recursive: true });
    const results: unknown[] = [];
    try {
      for (const scenario of [
        "axis",
        "rotated-parent",
        "clip",
        "opacity-isolation",
        "rotated-quality",
      ] as const) {
        const outer = createLayer("group", {
          id: "outer",
          x: 0,
          y: 0,
          width: 1080,
          height: 1920,
          opacity: scenario === "rotated-quality" ? 1 : 0.5,
          rotation: scenario === "rotated-parent" ? 90 : 0,
          blendMode: scenario === "axis" ? "multiply" : "normal",
        });
        const child = createLayer(scenario === "rotated-quality" ? "ellipse" : "rectangle", {
          id: "tick",
          parentId: outer.id,
          x: scenario === "clip" ? 1079.5 : 40,
          y: 50,
          width: scenario === "rotated-quality" ? 3.5 : 1,
          height: 11,
          rotation: scenario === "rotated-quality" ? 25 : 0,
          fill: "#d5ff46",
        });
        let selected = child.id,
          layers: Layer[] = [outer, child];
        if (scenario === "opacity-isolation") {
          const small = createLayer("group", {
            id: "small",
            parentId: outer.id,
            x: 40,
            y: 50,
            width: 1,
            height: 11,
          });
          selected = small.id;
          layers = [
            outer,
            small,
            { ...child, parentId: small.id, x: 0, y: 0, opacity: 0.5 },
            { ...child, id: "overlap", parentId: small.id, x: 0, y: 0, opacity: 0.5 },
          ];
        }
        const original = createPage({ width: 1080, height: 1920, layers }),
          before = structuredClone(original);
        const scope = selectionComposition(original, [selected]);
        const matrix = layerTransform(outer),
          safeWidth = 250,
          safeHeight = 250,
          angle = (outer.rotation * Math.PI) / 180;
        const safe = {
          ...outer,
          width: safeWidth,
          height: safeHeight,
          x:
            matrix[4] -
            safeWidth / 2 +
            (Math.cos(angle) * safeWidth) / 2 -
            (Math.sin(angle) * safeHeight) / 2,
          y:
            matrix[5] -
            safeHeight / 2 +
            (Math.sin(angle) * safeWidth) / 2 +
            (Math.cos(angle) * safeHeight) / 2,
        };
        const referenceLayers = layers.map((layer) => (layer.id === outer.id ? safe : layer));
        if (scenario === "clip") {
          safe.x = 830;
          referenceLayers[1] = { ...child, x: 249.5 };
        }
        const reference = selectionComposition({ ...original, layers: referenceLayers }, [
          selected,
        ]);
        const actual = await render(scope),
          expected = await render(reference);
        await save(scenario, actual);
        await save(`${scenario}-safe-reference`, expected);
        const difference = await imageDifference(inspection, expected, actual);
        expect(difference.reference).toEqual(difference.candidate);
        expect(difference.differentBytes, scenario).toBe(0);
        const witness = await inspectImage(
          page,
          actual,
          [{ x: 0, y: 0, width: 1, height: 1 }],
          inspection,
        );
        expect(witness.regions[0]!.backgroundDistance).toBeGreaterThan(20);
        const pixels = await pixelProbe(inspection, actual, scenario === "clip");
        expect(Math.max(...pixels.alphas)).toBeGreaterThan(0);
        if (scenario === "axis") expect(pixels.alphas).toEqual([128]);
        if (scenario === "opacity-isolation") expect(pixels.alphas).toEqual([96]);
        if (scenario === "clip") expect(pixels.outsideAlpha).toBe(0);
        if (scenario === "rotated-quality") {
          const direct = selectionComposition(
            { ...original, layers: [{ ...child, parentId: null }] },
            [child.id],
          );
          const analytical = await render(direct);
          await save("rotated-quality-analytical", analytical);
          const quality = await premultipliedDifference(inspection, analytical, actual);
          expect(quality.covered).toBeGreaterThan(30);
          expect(quality.max).toBeLessThanOrEqual(2);
          expect(quality.alphaMax).toBeLessThanOrEqual(2);
          results.push({ scenario, quality });
        }
        expect(original).toEqual(before);
        results.push({ scenario, scope: [scope.width, scope.height], difference, pixels });
      }
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="g"><stop stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/></svg>';
      const mask: Asset = {
        id: "gradient-mask",
        name: "Authored mask",
        mime: "image/svg+xml",
        width: 128,
        height: 128,
        dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      };
      const outer = createLayer("group", { id: "outer", x: 0, y: 0, width: 1080, height: 1920 });
      const treated = createLayer("group", {
        id: "treated",
        parentId: outer.id,
        x: 10,
        y: 20,
        width: 128,
        height: 128,
        effects: [
          createEffect("noise", { amount: 0.7, scale: 16, seed: 42 }),
          createEffect("blur", { amount: 1, scale: 8 }),
        ],
        mask: { assetId: mask.id, enabled: true, inverted: false, mode: "luminance" },
      });
      const inner = createLayer("group", {
        id: "inner",
        parentId: treated.id,
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
      });
      const child = createLayer("rectangle", {
        id: "tick",
        parentId: inner.id,
        x: 60,
        y: 70,
        width: 1,
        height: 11,
        fill: "#40a0e0",
      });
      const full = createPage({
        width: 256,
        height: 256,
        background: "transparent",
        layers: [outer, treated, inner, child],
      });
      const actual = await render(selectionComposition(full, [child.id]), { [mask.id]: mask }, 8);
      // A different page namespace forces an independent reference computation;
      // a scoped processing-domain bug cannot donate its cached ancestor pixels.
      const fullPng = await render({ ...full, id: `${full.id}-reference` }, { [mask.id]: mask }, 1);
      const expected = await inspection.evaluate(async (source) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = 8;
        c.height = 88;
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 70, 90, 1, 11, 0, 0, 8, 88);
        return c.toDataURL("image/png");
      }, fullPng);
      await save("treated-mask-scope", actual);
      await save("treated-mask-reference", expected);
      const treatedDifference = await imageDifference(inspection, expected, actual),
        treatedPixels = await pixelProbe(inspection, actual);
      expect(treatedDifference.differentBytes).toBe(0);
      expect(Math.max(...treatedPixels.alphas)).toBeGreaterThan(0);
      expect(Math.max(...treatedPixels.alphas)).toBeLessThan(255);
      const environment = await densityEnvironment(page);
      expect(environment.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
      expect(errors).toEqual([]);
      await writeFile(
        `artifacts/group-scope/${key}.json`,
        JSON.stringify({ results, treatedDifference, treatedPixels, environment, errors }, null, 2),
      );
    } finally {
      await inspection.close();
    }
  });
