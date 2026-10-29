import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EFFECT_CATALOG,
  getEffectDefinition,
  GRADIENT_STYLES,
  GRADIENT_TREATMENTS,
  type Effect,
  type EffectType,
} from "@musart/core";
import type { Page } from "@playwright/test";
export interface DensityCase {
  name: string;
  effect: Effect;
  flat: boolean;
  tolerance: number;
  fractional?: boolean;
  mask?: boolean;
}
const patterned = new Set<EffectType>([
  "ascii",
  "dither",
  "grain",
  "halftone",
  "circle",
  "bit-dither",
]);
const densityOverrides: Partial<Record<EffectType, Partial<Effect>>> = {
  ripple: {
    time: 0.25,
    settings: { innerRadius: 8, radius: 44, feather: 4, amplitude: 5, wavelength: 16, speed: 12 },
  },
  shatter: { scale: 24 },
  noise: { scale: 16 },
};
function densityScale(type: EffectType): number {
  const definition = getEffectDefinition(type);
  const parameter = definition.parameters.find((p) => p.key === "scale" && p.scope !== "settings");
  if (parameter?.kind !== "number") return definition.defaults.scale;
  const desired = type === "ascii" ? 20 : type === "halftone" ? 12 : 4;
  return Math.max(parameter.min, Math.min(parameter.max, desired));
}
const gradient = (settings: Partial<NonNullable<Effect["settings"]>>) =>
  createEffect("gradient", {
    amount: 1,
    scale: 0.8,
    seed: 97,
    time: 1.25,
    settings: {
      preset: "custom",
      style: "mesh",
      treatment: "none",
      grain: 0.6,
      grainScale: 4,
      vignette: 0.15,
      borderRadius: 6,
      size: 12,
      ...settings,
    },
  });
export const DENSITY_CASES: readonly DensityCase[] = [
  ...Object.keys(EFFECT_CATALOG)
    .filter((type) => type !== "gradient")
    .map((type) => ({
      name: type,
      effect: createEffect(type as EffectType, {
        amount: 0.8,
        scale: densityScale(type as EffectType),
        levels: 6,
        color: true,
        seed: 9321,
        ...densityOverrides[type as EffectType],
      }),
      flat: patterned.has(type as EffectType),
      tolerance: type === "ascii" ? 13 : type === "halftone" ? 8 : 3,
    })),
  ...GRADIENT_STYLES.map((style) => ({
    name: `gradient-${style}`,
    effect: gradient({ style }),
    flat: true,
    tolerance: 4,
  })),
  ...GRADIENT_TREATMENTS.filter((treatment) => treatment !== "none").map((treatment) => ({
    name: `gradient-${treatment}`,
    effect: gradient({ treatment, grain: 0.4, frost: 0.8, gap: 0.12, roundness: 0.1 }),
    flat: true,
    tolerance: treatment === "ascii" ? 14 : treatment === "dither" ? 7 : 6,
  })),
  {
    name: "gradient-frost-fixed-document-pixels",
    effect: gradient({
      treatment: "glass",
      grain: 0,
      grainScale: 1,
      borderRadius: 0,
      vignette: 0,
      color0: "#808080",
      color1: "#808080",
      color2: "#808080",
      color3: "#808080",
      color4: "#808080",
      color5: "#808080",
      brightness: 1,
      saturation: 1,
      contrast: 1,
      shadows: 0,
      highlights: 0,
      refraction: 0,
      blur: 0,
      dispersion: 0,
      highlight: 0,
      frost: 1,
    }),
    flat: true,
    tolerance: 1.5,
  },
  ...(["blocks", "glass", "folds"] as const).map((treatment) => ({
    name: `gradient-${treatment}-minimum-document-size`,
    effect: gradient({ treatment, size: 1, grain: 0, frost: 0, borderRadius: 0 }),
    flat: true,
    tolerance: 7,
  })),
  {
    name: "fractional-grain",
    effect: createEffect("grain", { amount: 0.8, scale: 4, seed: 9321, color: true }),
    flat: true,
    tolerance: 4,
    fractional: true,
  },
  {
    name: "masked-group-grain",
    effect: createEffect("grain", { amount: 0.8, scale: 4, seed: 9321, color: true }),
    flat: true,
    tolerance: 5,
    mask: true,
  },
  {
    name: "masked-group-glass",
    effect: gradient({ treatment: "glass", frost: 0.8 }),
    flat: true,
    tolerance: 6,
    mask: true,
  },
];
export function densityProject(fixture: DensityCase, opaque = false) {
  const width = fixture.fractional ? 95.5 : 96,
    height = fixture.fractional ? 63.25 : 64;
  const owner = createLayer("group", {
    id: "density-owner",
    x: 8,
    y: 8,
    width,
    height,
    effects: [fixture.effect],
    ...(fixture.mask
      ? {
          mask: {
            layerId: "density-mask",
            mode: "luminance" as const,
            enabled: true,
            inverted: false,
          },
        }
      : {}),
  });
  const colors = fixture.flat ? ["#8090a0"] : ["#ec426d", "#2acb82", "#426dec"];
  return createProject({
    name: `Density ${fixture.name}`,
    pages: [
      createPage({
        id: "density-page",
        width: 112,
        height: 80,
        background: opaque ? "#101820" : "transparent",
        layers: [
          owner,
          ...colors.map((fill, index) =>
            createLayer("rectangle", {
              id: `density-child-${index}`,
              parentId: owner.id,
              x: (index * width) / colors.length,
              y: 0,
              width: width / colors.length,
              height,
              fill,
              radius: 0,
            }),
          ),
          ...(fixture.flat
            ? []
            : [
                createLayer("ellipse", {
                  id: "density-highlight",
                  parentId: owner.id,
                  x: 18,
                  y: 12,
                  width: 40,
                  height: 36,
                  fill: "#ffffff",
                  opacity: 0.65,
                }),
              ]),
          ...(fixture.mask
            ? [
                createLayer("rectangle", {
                  id: "density-overlap",
                  parentId: owner.id,
                  x: 20,
                  y: 14,
                  width: 56,
                  height: 40,
                  fill: "#f07a48",
                  opacity: 0.55,
                  blendMode: "multiply",
                }),
                createLayer("ellipse", {
                  id: "density-mask",
                  maskSource: true,
                  x: 24,
                  y: 12,
                  width: 64,
                  height: 52,
                  fill: "#ffffff",
                  rotation: 13,
                  effects: [createEffect("grain", { scale: 4, amount: 0.6, seed: 19 })],
                }),
              ]
            : []),
        ],
      }),
    ],
  });
}
export async function compareDensity(
  inspector: Page,
  reference: string,
  candidate: string,
  coverageControl?: { reference: string; candidate: string },
  geometryControl?: { reference: string; candidate: string },
) {
  return inspector.evaluate(
    async ({ reference, candidate, coverageControl, geometryControl }) => {
      async function decode(src: string, width?: number, height?: number) {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = width ?? image.width;
        canvas.height = height ?? image.height;
        const context = canvas.getContext("2d")!;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return {
          width: image.width,
          height: image.height,
          pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
        };
      }
      const a = await decode(reference),
        b = await decode(candidate, a.width, a.height);
      const decodeControl = async (input?: { reference: string; candidate: string }) =>
        input
          ? {
              a: await decode(input.reference, a.width, a.height),
              b: await decode(input.candidate, a.width, a.height),
              referenceAlphaMax: 0,
              candidateAlphaMax: 0,
              coverageDeltaMax: 0,
            }
          : null;
      const control = await decodeControl(coverageControl),
        geometry = await decodeControl(geometryControl);
      let differentPixels = 0,
        maximumByteDifference = 0;
      for (let offset = 0; offset < a.pixels.length; offset += 4) {
        let different = false;
        for (let channel = 0; channel < 4; channel++) {
          const difference = Math.abs(a.pixels[offset + channel]! - b.pixels[offset + channel]!);
          maximumByteDifference = Math.max(maximumByteDifference, difference);
          different ||= difference !== 0;
        }
        if (different) differentPixels++;
      }
      let total = 0,
        commonColor = 0,
        coverageColor = 0,
        alpha = 0,
        samples = 0,
        minimumAlpha = 255,
        maximumAlpha = 0;
      const errors: number[] = [];
      for (let y = 8; y < 72; y++)
        for (let x = 8; x < 104; x++) {
          const offset = (y * a.width + x) * 4,
            aa = a.pixels[offset + 3]!,
            ba = b.pixels[offset + 3]!;
          minimumAlpha = Math.min(minimumAlpha, aa);
          maximumAlpha = Math.max(maximumAlpha, aa);
          alpha += Math.abs(aa - ba);
          for (const item of [control, geometry])
            if (item) {
              const ca = item.a.pixels[offset + 3]!,
                cb = item.b.pixels[offset + 3]!;
              item.referenceAlphaMax = Math.max(item.referenceAlphaMax, Math.abs(aa - ca));
              item.candidateAlphaMax = Math.max(item.candidateAlphaMax, Math.abs(ba - cb));
              item.coverageDeltaMax = Math.max(
                item.coverageDeltaMax,
                Math.abs(aa - ba - (ca - cb)),
              );
            }
          let error = 0;
          for (let channel = 0; channel < 3; channel++) {
            const ac = a.pixels[offset + channel]!,
              bc = b.pixels[offset + channel]!;
            error += Math.abs((ac * aa) / 255 - (bc * ba) / 255);
            commonColor += (Math.min(aa, ba) * Math.abs(ac - bc)) / 255;
            // Direct per-channel coverage term, never raw error minus color.
            coverageColor += (Math.abs(aa - ba) * (aa >= ba ? ac : bc)) / 255;
          }
          total += error;
          errors.push(error / 3);
          samples++;
        }
      errors.sort((a, b) => a - b);
      return {
        reference: [a.width, a.height],
        candidate: [b.width, b.height],
        rgbMean: total / (samples * 3),
        commonCoverageRgbMean: commonColor / (samples * 3),
        coverageRgbContribution: coverageColor / (samples * 3),
        pixels: samples,
        coverageControl: control
          ? {
              referenceAlphaMax: control.referenceAlphaMax,
              candidateAlphaMax: control.candidateAlphaMax,
              coverageDeltaMax: control.coverageDeltaMax,
            }
          : null,
        disabledGeometryDiagnostic: geometry
          ? {
              referenceAlphaMax: geometry.referenceAlphaMax,
              candidateAlphaMax: geometry.candidateAlphaMax,
              coverageDeltaMax: geometry.coverageDeltaMax,
            }
          : null,
        alphaMean: alpha / samples,
        p95: errors[Math.floor(errors.length * 0.95)]!,
        max: errors.at(-1)!,
        minimumAlpha,
        maximumAlpha,
        differentPixels,
        maximumByteDifference,
      };
    },
    { reference, candidate, coverageControl, geometryControl },
  );
}

export async function densityEnvironment(page: Page) {
  return page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter(),
      info = adapter?.info;
    return {
      browser: navigator.userAgent,
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .backend,
      adapter: info
        ? {
            vendor: info.vendor,
            architecture: info.architecture,
            device: info.device,
            description: info.description,
          }
        : null,
      reads: window.__musartVideoReadbacks!,
    };
  });
}
