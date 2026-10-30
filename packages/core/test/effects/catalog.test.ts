import { describe, expect, it } from "vitest";
import { EFFECT_CATALOG, getEffectDefinition } from "../../src/effects/catalog";
import { getEffectParameter, patchEffectParameter } from "../../src/effects/parameters";
import { GRADIENT_DEFINITION } from "../../src/effects/gradient/definition";
import { createEffect, createLayer } from "../../src/document/factories";
import type { EffectType } from "../../src/document/model";

describe("portable effect definitions", () => {
  it("describes every supported effect once, with the existing deterministic defaults", () => {
    expect(Object.keys(EFFECT_CATALOG)).toEqual([
      "dither",
      "ascii",
      "brightness",
      "contrast",
      "grayscale",
      "blur",
      "shadow",
      "saturation",
      "hue",
      "exposure",
      "vibrance",
      "temperature",
      "tint",
      "gamma",
      "invert",
      "sepia",
      "threshold",
      "posterize",
      "grain",
      "halftone",
      "vignette",
      "gradient",
      "ripple",
      "shatter",
      "noise",
      "flashlight",
      "circle",
      "cyanotype",
      "datamosh",
      "crt",
      "bit-dither",
      "receipt",
      "pink-phosphor",
      "transition",
    ]);
    expect(getEffectDefinition("dither")).toMatchObject({
      type: "dither",
      nameKey: "dither",
      defaults: { enabled: true, amount: 1, scale: 2, levels: 2, color: false, seed: 42 },
    });
    expect(getEffectDefinition("ascii").defaults).toMatchObject({
      amount: 1,
      scale: 10,
      levels: 10,
      color: true,
    });
    expect(getEffectDefinition("brightness").defaults.amount).toBe(0.5);
    expect(getEffectDefinition("contrast").defaults.amount).toBe(0.5);
    expect(getEffectDefinition("grayscale").defaults.amount).toBe(1);
    expect(getEffectDefinition("blur").defaults.scale).toBe(2);
  });
  it("provides typed controls in document units and meaningful display metadata", () => {
    const expected: Record<EffectType, string[]> = {
      transition: ["amount", "style", "progress", "softness", "strength", "detail", "direction"],
      dither: ["amount", "scale", "levels", "color", "seed"],
      ascii: ["amount", "scale", "color"],
      brightness: ["amount"],
      contrast: ["amount"],
      grayscale: ["amount"],
      blur: ["amount", "scale"],
      shadow: ["amount", "offsetX", "offsetY", "radius", "shadowColor"],
      saturation: ["amount"],
      hue: ["amount"],
      exposure: ["amount"],
      vibrance: ["amount"],
      temperature: ["amount"],
      tint: ["amount"],
      gamma: ["amount"],
      invert: ["amount"],
      sepia: ["amount"],
      threshold: ["amount"],
      posterize: ["amount", "levels"],
      grain: ["amount", "scale", "color", "seed"],
      halftone: ["amount", "scale", "color"],
      vignette: ["amount", "scale"],
      gradient: GRADIENT_DEFINITION.parameters.map((parameter) => parameter.key),
      ripple: [
        "amount",
        "centerX",
        "centerY",
        "innerRadius",
        "radius",
        "feather",
        "falloff",
        "amplitude",
        "wavelength",
        "speed",
        "phase",
        "direction",
        "dispersion",
        "time",
      ],
      shatter: [
        "amount",
        "scale",
        "seed",
        "pattern",
        "centerX",
        "centerY",
        "radius",
        "innerRadius",
        "falloff",
        "jitter",
        "spokes",
        "displacement",
        "rotation",
        "ior",
        "thickness",
        "dispersion",
        "tilt",
        "roughness",
        "crackWidth",
        "cracks",
        "highlights",
        "tintStrength",
        "tintColor",
        "crackColor",
        "highlightColor",
        "cutout",
      ],
      "pink-phosphor": [
        "amount",
        "scale",
        "seed",
        "exposure",
        "gamma",
        "contrast",
        "glow",
        "glowRadius",
        "glowThreshold",
        "scanlines",
        "beamWidth",
        "grain",
        "flicker",
        "speed",
        "background",
        "phosphor",
        "highlight",
        "time",
      ],
      receipt: [
        "amount",
        "scale",
        "seed",
        "mode",
        "exposure",
        "gamma",
        "contrast",
        "invert",
        "inkColor",
        "paperColor",
        "inkOpacity",
        "dotSpread",
        "dotSoftness",
        "wear",
        "feedBanding",
        "feedPitch",
        "streaks",
        "streakWidth",
        "marginX",
        "marginY",
        "fit",
        "paperTexture",
        "fiberSize",
        "edge",
        "edgeHeight",
        "edgePitch",
        "edgeJitter",
        "edgeSoftness",
        "edgeShade",
        "foldStrength",
        "foldPosition",
        "foldWidth",
        "cutout",
      ],
      "bit-dither": [
        "amount",
        "method",
        "scale",
        "seed",
        "threshold",
        "strength",
        "contrast",
        "gamma",
        "invert",
        "foreground",
        "background",
      ],
      datamosh: [
        "amount",
        "blockSize",
        "density",
        "displacement",
        "direction",
        "angleVariation",
        "coherence",
        "smear",
        "chromaShift",
        "levels",
        "rate",
        "seed",
        "time",
      ],
      crt: [
        "amount",
        "scale",
        "seed",
        "mask",
        "maskStrength",
        "maskGap",
        "scanlineStrength",
        "scanlinePitch",
        "scanlineWidth",
        "scanlinePhase",
        "curvatureX",
        "curvatureY",
        "zoom",
        "convergence",
        "glow",
        "glowRadius",
        "brightness",
        "contrast",
        "saturation",
        "tintColor",
        "vignette",
        "roundness",
        "borderSoftness",
        "bezelColor",
        "noise",
        "jitter",
        "flicker",
        "flickerRate",
        "rollingBar",
        "rollingSpeed",
        "cutout",
        "time",
      ],
      cyanotype: [
        "amount",
        "exposure",
        "contrast",
        "gamma",
        "density",
        "blackPoint",
        "whitePoint",
        "invert",
        "inkColor",
        "paperColor",
        "wash",
        "unevenness",
        "textureScale",
        "paperGrain",
        "grainScale",
        "fibers",
        "fiberScale",
        "edgeFade",
        "edgeWidth",
        "seed",
      ],
      circle: [
        "amount",
        "spacing",
        "rotation",
        "dotSize",
        "softness",
        "gamma",
        "polarity",
        "foreground",
        "foregroundOpacity",
        "background",
        "backgroundOpacity",
      ],
      flashlight: [
        "amount",
        "centerX",
        "centerY",
        "radius",
        "softness",
        "falloff",
        "aspect",
        "rotation",
        "intensity",
        "ambient",
        "exposure",
        "highlightCompression",
        "saturation",
        "glow",
        "grain",
        "grainSize",
        "seed",
        "lightColor",
        "invert",
      ],
      noise: [
        "amount",
        "algorithm",
        "scale",
        "seed",
        "color",
        "octaves",
        "lacunarity",
        "persistence",
        "jitter",
        "offsetX",
        "offsetY",
        "offsetZ",
        "speed",
        "contrast",
        "brightness",
        "gamma",
        "invert",
        "mode",
        "lowColor",
        "highColor",
        "time",
      ],
    };
    for (const definition of Object.values(EFFECT_CATALOG)) {
      expect(definition.parameters.map((parameter) => parameter.key)).toEqual(
        expected[definition.type],
      );
      expect(getEffectDefinition(definition.type)).toBe(definition);
      expect(definition.coverage).toBe(
        ["blur", "shadow"].includes(definition.type)
          ? "expand"
          : ["gradient", "circle", "shatter", "crt", "receipt", "transition"].includes(
                definition.type,
              )
            ? "reduce"
            : "preserve",
      );
      expect(definition.category).toBe(
        [
          "dither",
          "ascii",
          "blur",
          "shadow",
          "grain",
          "halftone",
          "vignette",
          "gradient",
          "ripple",
          "shatter",
          "noise",
          "flashlight",
          "circle",
          "cyanotype",
          "datamosh",
          "crt",
          "bit-dither",
          "receipt",
          "pink-phosphor",
          "transition",
        ].includes(definition.type)
          ? "effect"
          : "adjustment",
      );
      for (const parameter of definition.parameters) {
        expect(parameter.labelKey.length).toBeGreaterThan(0);
        if (parameter.kind === "boolean")
          expect(typeof getEffectParameter(createEffect(definition.type), parameter)).toBe(
            "boolean",
          );
        else if (parameter.kind === "number") {
          const value = getEffectParameter(createEffect(definition.type), parameter);
          expect(value).toBeGreaterThanOrEqual(parameter.min);
          expect(value).toBeLessThanOrEqual(parameter.max);
          expect(parameter.step).toBeGreaterThan(0);
          expect(parameter.displayScale).toBeGreaterThan(0);
          if (parameter.key === "amount")
            expect(parameter).toMatchObject({
              min: 0,
              max: 1,
              step: 0.01,
              displayScale: 100,
              unit: "%",
            });
          if (parameter.key === "scale" && !["gradient", "vignette"].includes(definition.type))
            expect(parameter.unit).toBe("px");
        }
      }
    }
    expect(
      getEffectDefinition("ascii").parameters.find((parameter) => parameter.key === "scale"),
    ).toMatchObject({ max: 128 });
    expect(
      getEffectDefinition("dither").parameters.find((parameter) => parameter.key === "scale"),
    ).toMatchObject({ max: 128 });
  });
  it("keeps shared definitions deeply immutable while factories produce independent effect instances", () => {
    const definition = getEffectDefinition("dither");
    expect(Object.isFrozen(EFFECT_CATALOG)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.defaults)).toBe(true);
    expect(Object.isFrozen(definition.parameters)).toBe(true);
    expect(Object.isFrozen(definition.parameters[0])).toBe(true);
    const first = createEffect("dither", { amount: 0.2 });
    const second = createEffect("dither");
    expect(first.id).not.toBe(second.id);
    first.scale = 10;
    expect(second.scale).toBe(2);
    expect(definition.defaults.amount).toBe(1);
    expect(definition.defaults.scale).toBe(2);
    expect(createLayer("text").fontFamily).toBe("Inter");
  });
  it("rejects unknown names and prototype keys at the public catalogue boundary", () => {
    expect(() => getEffectDefinition("unknown" as never)).toThrow("Effet inconnu");
    expect(() => getEffectDefinition("toString" as never)).toThrow("Effet inconnu");
    expect(() => createEffect("unknown" as never)).toThrow("Effet inconnu");
  });
  it("accepts the complete supported pixel and quantization ranges and real deterministic seeds", () => {
    const ascii = createEffect("ascii"),
      dither = createEffect("dither"),
      grain = createEffect("grain");
    const scale = getEffectDefinition("ascii").parameters.find(
      (parameter) => parameter.key === "scale",
    )!;
    const levels = getEffectDefinition("dither").parameters.find(
      (parameter) => parameter.key === "levels",
    )!;
    expect(patchEffectParameter(ascii, scale, 128)).toEqual({ scale: 128 });
    expect(patchEffectParameter(dither, levels, 256)).toEqual({ levels: 256 });
    for (const effect of [dither, grain]) {
      const seed = getEffectDefinition(effect.type).parameters.find(
        (parameter) => parameter.key === "seed",
      )!;
      expect(patchEffectParameter(effect, seed, 145)).toEqual({ seed: 145 });
      expect(() => patchEffectParameter(effect, seed, 145.5)).toThrow();
    }
  });
});
