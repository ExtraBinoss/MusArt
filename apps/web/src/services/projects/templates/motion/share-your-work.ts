import {
  MOTION_ANIMATION_PRESETS,
  type ImageAsset,
  type MotionAnimationPreset,
} from "@musart/core";
import { TemplateAuthor, seconds } from "./author";
import type { BuiltMotionTemplate } from "./model";

/** Reconstruct the supplied rapid 480-square collage using editable native animation blocks. */
export function createShareYourWork(photos: readonly ImageAsset[]): BuiltMotionTemplate {
  if (photos.length !== 8) throw Error("Share Your Work requires eight replacement photographs");
  const a = new TemplateAuthor("share-your-work", "Share Your Work", 480, 480);
  const placements = [
    [238, 144, 170, -4],
    [295, 165, 175, 9],
    [370, 250, 180, 4],
    [379, 321, 175, -10],
    [260, 329, 180, 6],
    [175, 322, 185, 10],
    [116, 280, 180, -10],
    [174, 229, 180, 3],
  ] as const;
  const cards = placements.map(([cx, cy, size, rotation], index) =>
    a.layer("image", `share-card-${index + 1}`, `Card ${index + 1}`, {
      assetId: photos[index]!.id,
      x: cx - size / 2,
      y: cy - size / 2,
      width: size,
      height: size,
      rotation,
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
      fontSize: value === "SHARE" ? 75 : value === "WORK" ? 74 : 72,
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
      text: "SHARE YOUR WORK",
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
        cards[1]!,
        cards[2]!,
        cards[3]!,
        cards[4]!,
        cards[5]!,
        cards[0]!,
        text("share-title", "SHARE", 53, 141, 310),
        cards[6]!,
        cards[7]!,
        text("share-your", "YOUR", 145, 196, 225),
        text("share-work", "WORK", 127, 257, 260),
        ...labels,
      ],
    },
  ]);
  a.initialize();
  a.commit([{ type: "setMotionDuration", duration: seconds(1.5) }]);
  const entrance = structuredClone(
    MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scale-blur")!,
  );
  entrance.duration = 450;
  for (const channel of entrance.channels) {
    channel.points[1]!.at = 1 / 3;
    channel.points.push({ ...structuredClone(channel.points[1]!), at: 1 });
  }
  for (let index = 0; index < cards.length; index++) {
    const start = (index - 2) * 0.15;
    a.commit([
      {
        type: "setMotionTrackRange",
        trackId: a.track(cards[index]!.id),
        start: seconds(start),
        end: seconds(start + 0.45),
      },
    ]);
    const preset: MotionAnimationPreset = structuredClone(entrance);
    if (start < 0)
      for (const channel of preset.channels) channel.points[0]!.value = channel.points[1]!.value;
    a.commit([
      {
        type: "addMotionAnimation",
        trackId: a.track(cards[index]!.id),
        preset,
        start: seconds(Math.max(0, start)),
        duration: seconds(start < 0 ? start + 0.45 : 0.45),
      },
    ]);
  }
  for (let index = 0; index < 2; index++) {
    const start = 0.9 + index * 0.15;
    a.commit([
      {
        type: "addMotionOccurrence",
        layerId: cards[index]!.id,
        start: seconds(start),
        end: seconds(start + 0.45),
      },
    ]);
    const track = a.engine
      .getSnapshot()
      .project.pages[0]!.motion!.tracks.filter((track) => track.layerId === cards[index]!.id)
      .at(-1)!;
    a.commit([
      {
        type: "addMotionAnimation",
        trackId: track.id,
        preset: entrance,
        start: seconds(start),
        duration: seconds(0.45),
      },
    ]);
  }
  const move: MotionAnimationPreset = {
    version: 1,
    id: "share-drift",
    name: "Move",
    category: "move",
    duration: 800,
    effects: [],
    channels: [
      {
        target: { kind: "layer", property: "x" },
        operation: "add",
        unit: "width",
        points: [
          { at: 0, value: 0 },
          { at: 1, value: 0.15, easing: { type: "linear" } },
        ],
      },
    ],
  };
  a.commit([
    {
      type: "addMotionAnimation",
      trackId: a.engine
        .getSnapshot()
        .project.pages[0]!.motion!.tracks.filter((track) => track.layerId === cards[0]!.id)
        .at(-1)!.id,
      preset: move,
      start: seconds(0.25),
      duration: seconds(0.8),
    },
  ]);
  return a.finish();
}
