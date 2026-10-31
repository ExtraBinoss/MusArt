import { createEffect, type ImageAsset, type MotionAnimationPreset } from "@musart/core";
import { TemplateAuthor, seconds } from "./author";
import type { BuiltMotionTemplate } from "./model";

/** Reconstruct the supplied rapid 480-square collage using editable native animation blocks. */
export function createShareYourWork(photos: readonly ImageAsset[]): BuiltMotionTemplate {
  if (photos.length !== 8) throw Error("Share Your Work requires eight replacement photographs");
  const a = new TemplateAuthor("share-your-work", "Too Hot to Haunt", 480, 480);
  const placements = [
    [238, 144, 170, -4],
    [295, 165, 170, 9],
    [363, 239, 170, 5],
    [357, 332, 170, -6],
    [241, 335, 170, 6],
    [168, 303, 170, 9],
    [115, 252, 170, -10],
    [148, 174, 170, 3],
  ] as const;
  const cards = placements.map(([cx, cy, size, rotation], index) =>
    a.layer("image", `share-card-${index + 1}`, `Card ${index + 1}`, {
      assetId: photos[index]!.id,
      x: cx - size / 2,
      y: cy - size / 2,
      width: size,
      height: size,
      rotation,
      effects: [
        createEffect("shadow", {
          id: `share-shadow-${index + 1}`,
          amount: 0.65,
          settings: { radius: 12, offsetX: 0, offsetY: 10, shadowColor: "#000000" },
        }),
      ],
    }),
  );
  const text = (id: string, value: string, x: number, y: number, width: number) =>
    a.layer("text", id, value, {
      text: value,
      x,
      y,
      width,
      height: 88,
      fontFamily: "Inter Variable",
      fontWeight: 750,
      fontSize: value === "HOT TO" ? 64 : 74,
      lineHeight: 0.85,
      letterSpacing: -4,
      fill: "#ffffff",
    });
  const labels = [
    a.layer("text", "share-credit", "Melt Motion", {
      text: "MELT MOTION",
      x: 160,
      y: 30,
      width: 160,
      height: 14,
      fontFamily: "Inter Variable",
      fontSize: 9,
      textAlign: "center",
      fill: "#ffffff",
    }),
    a.layer("text", "share-template-label", "Editable template", {
      text: "MELT BEFORE MIDNIGHT",
      x: 150,
      y: 439,
      width: 180,
      height: 14,
      fontFamily: "Inter Variable",
      fontSize: 9,
      textAlign: "center",
      fill: "#ffffff",
    }),
  ];
  a.commit([
    { type: "updatePage", patch: { background: "#000000" } },
    {
      type: "addLayers",
      assets: [...photos],
      layers: [
        cards[4]!,
        cards[5]!,
        cards[6]!,
        text("share-work", "HAUNT", 109, 257, 310),
        cards[3]!,
        text("share-your", "HOT TO", 127, 196, 300),
        cards[2]!,
        cards[1]!,
        cards[0]!,
        text("share-title", "TOO", 82, 141, 250),
        cards[7]!,
        ...labels,
      ],
    },
  ]);
  a.initialize();
  const period = 1.2;
  a.commit([{ type: "setMotionDuration", duration: seconds(period) }]);
  const curves = [
    {
      target: { kind: "layer", property: "scaleX" },
      points: [
        [0, 0.01],
        [1 / 3, 1],
        [2 / 3, 1],
        [1, 0.01],
      ],
    },
    {
      target: { kind: "layer", property: "scaleY" },
      points: [
        [0, 0.01],
        [1 / 3, 1],
        [2 / 3, 1],
        [1, 0.01],
      ],
    },
    {
      target: { kind: "layer", property: "opacity" },
      points: [
        [0, 0],
        [0.15, 1],
        [0.8, 1],
        [1, 0],
      ],
    },
    {
      target: { kind: "effect", slot: 0, property: "amount" },
      points: [
        [0, 1],
        [1 / 3, 0],
        [2 / 3, 0],
        [1, 1],
      ],
    },
  ] as const;
  for (const [index, card] of cards.entries()) {
    const phase = (index - 2) * 0.15;
    let first = true;
    for (const start of [phase, phase + period]) {
      const from = Math.max(0, start),
        to = Math.min(period, start + 0.45);
      if (to <= from) continue;
      if (first)
        a.commit([
          {
            type: "setMotionTrackRange",
            trackId: a.track(card.id),
            start: seconds(from),
            end: seconds(to),
          },
        ]);
      else
        a.commit([
          { type: "addMotionOccurrence", layerId: card.id, start: seconds(from), end: seconds(to) },
        ]);
      const track = a.engine
        .getSnapshot()
        .project.pages[0]!.motion!.tracks.filter((t) => t.layerId === card.id)
        .at(-1)!;
      const low = (from - start) / 0.45,
        high = (to - start) / 0.45;
      const preset: MotionAnimationPreset = {
        version: 1,
        id: "haunt-card-loop",
        name: "Seamless card pulse",
        category: "scale",
        duration: (to - from) * 1000,
        effects: [
          { type: "blur", enabled: true, amount: 1, scale: 1, levels: 2, color: false, seed: 42 },
        ],
        channels: curves.map((curve) => {
          const sample = (at: number) => {
            const next = curve.points.findIndex((point) => point[0] >= at);
            if (next <= 0) return curve.points[0][1];
            const a = curve.points[next - 1]!,
              b = curve.points[next]!;
            return a[1] + ((b[1] - a[1]) * (at - a[0])) / (b[0] - a[0]);
          };
          const times = [
            low,
            ...curve.points.map((p) => p[0]).filter((at) => at > low && at < high),
            high,
          ];
          return {
            target: curve.target,
            operation: "replace",
            points: times.map((at) => ({
              at: (at - low) / (high - low),
              value: sample(at),
              easing: { type: "linear" },
            })),
          };
        }),
      };
      a.commit([
        {
          type: "addMotionAnimation",
          trackId: track.id,
          preset,
          start: seconds(from),
          duration: seconds(to - from),
        },
      ]);
      first = false;
    }
  }
  return a.finish();
}
