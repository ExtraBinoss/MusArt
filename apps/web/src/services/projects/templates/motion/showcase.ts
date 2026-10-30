import { createEffect, createMotionEasingPreset as ease, type Command } from "@musart/core";
import { TemplateAuthor, seconds } from "./author";
import type { BuiltMotionTemplate, MotionTemplateMedia } from "./model";

/** Real source footage, photo collages, isolated groups/masks and typed GPU effect animation. */
export function createBloomTemplate(media: MotionTemplateMedia): BuiltMotionTemplate {
  if (media.photos.length < 2) throw Error("In Bloom requires two original photographs.");
  const a = new TemplateAuthor("in-bloom", "In Bloom — Motion showcase", 1440, 1040);
  const grain = createEffect("grain", { id: "bloom-grain", amount: 0.06, scale: 1, seed: 601 });
  const vignette = createEffect("vignette", { id: "bloom-vignette", amount: 0.1, scale: 2 });
  const gradient = createEffect("gradient", {
    id: "bloom-gradient",
    amount: 0.28,
    time: 0,
    seed: 60,
    settings: { style: "mesh", color0: "#d7ef96", color1: "#4a907d", color2: "#f0b7c3" },
  });
  a.add(
    [
      a.layer("rectangle", "bloom-paper", "Forest paper", {
        width: 1440,
        height: 1040,
        fill: "#142621",
      }),
      a.layer("ellipse", "bloom-orbit", "Living gradient / time", {
        x: 1150,
        y: -130,
        width: 470,
        height: 470,
        fill: "#d7ef96",
        effects: [gradient],
        opacity: 0.85,
      }),
      a.layer("text", "bloom-edition", "Edition", {
        x: 64,
        y: 34,
        width: 1100,
        height: 30,
        text: "MUSART  /  MOTION STUDIES  /  001",
        fontSize: 17,
        fontFamily: "Space Grotesk",
        fontWeight: 500,
        letterSpacing: 2.4,
        fill: "#d7ef96",
      }),
      a.layer("text", "bloom-title", "IN BLOOM", {
        x: 54,
        y: 78,
        width: 1100,
        height: 166,
        text: "IN BLOOM",
        fontSize: 151,
        fontWeight: 700,
        fontFamily: "Space Grotesk",
        letterSpacing: -5,
        fill: "#e7efcc",
      }),
      a.layer("text", "bloom-subtitle", "Subtitle", {
        x: 66,
        y: 248,
        width: 1150,
        height: 36,
        text: "A little wild. Always in motion.",
        fontSize: 27,
        fontWeight: 400,
        fill: "#b8ccbe",
      }),
      a.layer("rectangle", "bloom-frame", "Footage / cream frame", {
        width: 956,
        height: 550,
        fill: "#e8eacb",
        radius: 24,
      }),
      a.layer("video", "bloom-video", "Flower / original video + audio", {
        x: 12,
        y: 12,
        width: 932,
        height: 524.25,
        assetId: media.video.id,
        effects: [grain, vignette],
      }),
      a.layer("rectangle", "bloom-mask", "Footage / rounded alpha mask", {
        x: 12,
        y: 12,
        width: 932,
        height: 524.25,
        radius: 16,
        fill: "#ffffff",
      }),
      a.layer("rectangle", "bloom-card-paper", "Citrus / paper", {
        width: 304,
        height: 354,
        radius: 6,
        fill: "#f4efd9",
      }),
      a.layer("image", "bloom-citrus", "Citrus / original photograph", {
        x: 14,
        y: 14,
        width: 276,
        height: 276,
        assetId: media.photos[0]!.id,
      }),
      a.layer("text", "bloom-card-label", "Citrus / label", {
        x: 16,
        y: 306,
        width: 272,
        height: 30,
        text: "MADE TO MOVE",
        fontFamily: "Space Grotesk",
        fontSize: 18,
        fontWeight: 600,
        letterSpacing: 1.2,
        fill: "#263b2d",
      }),
      a.layer("rectangle", "bloom-hand-paper", "Colour / paper", {
        width: 226,
        height: 282,
        radius: 6,
        fill: "#f2d5d5",
      }),
      a.layer("image", "bloom-hand", "Colour / original photograph", {
        x: 13,
        y: 13,
        width: 200,
        height: 222.82,
        assetId: media.photos[1]!.id,
        effects: [createEffect("saturation", { id: "bloom-saturation", amount: 0.58 })],
      }),
      a.layer("text", "bloom-hand-label", "Colour / label", {
        x: 14,
        y: 246,
        width: 200,
        height: 25,
        text: "PLAY WITH COLOUR",
        fontSize: 13,
        fontFamily: "Space Grotesk",
        letterSpacing: 1.5,
        fill: "#50312d",
      }),
      a.layer("text", "bloom-footer", "Motion recipe", {
        x: 66,
        y: 932,
        width: 1100,
        height: 32,
        text: "VIDEO + PHOTOGRAPHY     /     KEYFRAMES     /     SPRINGS     /     LIVE GPU EFFECTS",
        fontSize: 16,
        fontFamily: "Space Grotesk",
        letterSpacing: 1,
        fontWeight: 400,
        fill: "#a8c1ae",
      }),
      a.layer("ellipse", "bloom-dot", "Edition dot", {
        x: 1300,
        y: 930,
        width: 28,
        height: 28,
        fill: "#e5ed9b",
      }),
    ],
    media,
  );
  const hero = a.group(["bloom-frame", "bloom-video", "bloom-mask"], "01 / Moving image", {
    x: 64,
    y: 336,
    width: 956,
    height: 550,
  });
  const citrus = a.group(
    ["bloom-card-paper", "bloom-citrus", "bloom-card-label"],
    "02 / Citrus postcard",
    {
      x: 1075,
      y: 372,
      width: 304,
      height: 354,
      rotation: 8,
    },
  );
  const hand = a.group(
    ["bloom-hand-paper", "bloom-hand", "bloom-hand-label"],
    "03 / Colour postcard",
    {
      x: 1100,
      y: 680,
      width: 226,
      height: 282,
      rotation: -10,
    },
  );
  a.commit([
    { type: "attachLayerMask", sourceId: "bloom-mask", targetId: "bloom-video", mode: "alpha" },
  ]);
  a.initialize();
  const commands: Command[] = [
    {
      type: "setMotionTrackRange",
      trackId: a.track("bloom-video"),
      start: seconds(0),
      end: seconds(5),
    },
    {
      type: "setMotionMedia",
      trackId: a.track("bloom-video"),
      patch: { sourceIn: seconds(0), volume: 0.65, mute: false },
    },
    ...a.layerKeys("bloom-title", "y", [
      [0, 108],
      [0.95, 78, ease("easeOut")],
      [4.4, 78],
      [5, 70, ease("easeInOut")],
    ]),
    ...a.layerKeys("bloom-title", "letterSpacing", [
      [0, -1],
      [1.1, -5, ease("easeOut")],
    ]),
    ...a.layerKeys("bloom-title", "opacity", [
      [0, 0],
      [0.5, 1, ease("easeOut")],
    ]),
    ...a.layerKeys(hero, "y", [
      [0, 395],
      [1.1, 336, ease("gentle")],
      [4.1, 336],
      [5, 324, ease("easeInOut")],
    ]),
    ...a.layerKeys(hero, "rotation", [
      [0, -2],
      [1.2, 0, ease("gentle")],
      [5, 0.5, ease("easeInOut")],
    ]),
    ...a.layerKeys(citrus, "x", [
      [0, 1450],
      [0.25, 1450],
      [1.6, 1075, ease("bouncy")],
      [4.4, 1075],
      [5, 1087, ease("easeInOut")],
    ]),
    ...a.layerKeys(citrus, "rotation", [
      [0, 22],
      [1.6, 8, ease("gentle")],
      [5, 5, ease("easeInOut")],
    ]),
    ...a.layerKeys(hand, "y", [
      [0, 1100],
      [0.7, 1100],
      [1.9, 680, { type: "cubicBezier", x1: 0.15, y1: 1.15, x2: 0.45, y2: 1 }],
      [5, 692, ease("easeInOut")],
    ]),
    ...a.layerKeys(hand, "rotation", [
      [0, -22],
      [1.9, -10, ease("quick")],
      [5, -7, ease("easeInOut")],
    ]),
    ...a.layerKeys("bloom-dot", "fill", [
      [0, "#e5ed9b"],
      [2.4, "#edb5ce", ease("easeInOut")],
      [5, "#e5ed9b", ease("easeInOut")],
    ]),
    ...a.layerKeys("bloom-hand-label", "text", [
      [0, "PLAY WITH COLOUR"],
      [2.8, "KEEP EXPLORING", ease("hold")],
    ]),
    ...a.keys({ kind: "effect", layerId: "bloom-orbit", effectId: gradient.id, property: "time" }, [
      [0, 0],
      [5, 5, ease("linear")],
    ]),
    ...a.keys({ kind: "effect", layerId: "bloom-video", effectId: grain.id, property: "amount" }, [
      [0, 0.025],
      [2.5, 0.09, ease("easeInOut")],
      [5, 0.025, ease("easeInOut")],
    ]),
    ...a.keys(
      { kind: "effect", layerId: "bloom-hand", effectId: "bloom-saturation", property: "amount" },
      [
        [0, 0.5],
        [2.6, 0.7, ease("easeInOut")],
        [5, 0.58, ease("easeInOut")],
      ],
    ),
  ];
  a.commit(commands);
  a.sounds(media, [
    { sound: 0, start: 0.15, volume: 0.45 },
    { sound: 1, start: 0.65, volume: 0.55 },
    { sound: 1, start: 1.9, volume: 0.4 },
    { sound: 2, start: 2.8, volume: 0.35 },
  ]);
  return a.finish();
}
