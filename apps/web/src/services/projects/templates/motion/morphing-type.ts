import { createEffect, type MotionAnimationPreset } from "@musart/core";
import { TemplateAuthor, seconds } from "./author";
import { brand } from "../../../../ui/brand/config";
import { meltMascotMorph } from "./melt-mascot";
import type { BuiltMotionTemplate } from "./model";

/** Original Melt mascot on white; native vector morph and editable wordmark. */
export function createMorphingType(): BuiltMotionTemplate {
  const a = new TemplateAuthor("morphing-type", "Melt Mascot", 1920, 1080);
  a.commit([{ type: "updatePage", patch: { background: "#ffffff" } }]);
  const shapeMorph = meltMascotMorph();
  const points = shapeMorph.shapes[0]!.frames[0]!.contours[0]!.points;
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x * 640} ${y * 640}`).join(" ") + "Z";
  const body = a.layer("vector", "melt-mascot-body", "Melt mascot", {
    x: 640,
    y: 100,
    width: 640,
    height: 640,
    fill: brand.colors.primary,
    vector: { path, viewBox: "0 0 640 640" },
  });
  a.add([
    body,
    ...[862, 1002].map((x, i) =>
      a.layer("rectangle", `melt-eye-${i}`, `Eye ${i + 1}`, {
        x,
        y: 345,
        width: 56,
        height: 108,
        radius: 28,
        fill: "#ffffff",
      }),
    ),
    a.layer("ellipse", "melt-mouth", "Mouth", {
      x: 929,
      y: 488,
      width: 62,
      height: 42,
      fill: "#ffffff",
    }),
    a.layer("text", "melt-wordmark", "Melt", {
      text: brand.name,
      x: 600,
      y: 790,
      width: 720,
      height: 210,
      fontFamily: "Inter Variable",
      fontSize: 170,
      fontWeight: 800,
      textAlign: "center",
      fill: brand.colors.primary,
    }),
  ]);
  a.initialize();
  a.commit([{ type: "setMotionDuration", duration: seconds(2.4) }]);
  const { id: _id, ...effect } = createEffect("morph", {
    shapeMorph,
    settings: { progress: 0, stagger: 0, inflate: 0, stretch: 1, order: "forward" },
  });
  const preset: MotionAnimationPreset = {
    version: 1,
    id: "melt-mascot-loop",
    name: "Melt & return",
    category: "scale",
    duration: 2400,
    effects: [effect],
    channels: [
      {
        target: { kind: "effectSetting", slot: 0, property: "progress" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 1, value: 1, easing: { type: "linear" } },
        ],
      },
    ],
  };
  a.commit([
    {
      type: "addMotionAnimation",
      trackId: a.track(body.id),
      preset,
      start: seconds(0),
      duration: seconds(2.4),
    },
  ]);
  return a.finish();
}
