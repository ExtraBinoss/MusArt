import { createEffect, validateShapeMorph, type MotionAnimationPreset } from "@musart/core";
import geometry from "./morph-reference.json" with { type: "json" };
import { TemplateAuthor, seconds } from "./author";
import type { BuiltMotionTemplate } from "./model";

/** Native editable text and authored vector states from the supplied 67-frame reference. */
export function createMorphingType(): BuiltMotionTemplate {
  validateShapeMorph(geometry);
  const a = new TemplateAuthor("morphing-type", "Morphing Type", 790, 480);
  a.commit([{ type: "updatePage", patch: { background: "#111232" } }]);
  const subject = a.layer("text", "morphing-title", "MORPH", {
    text: "MORPH",
    width: 790,
    height: 480,
    fontFamily: "Inter Variable",
    fontSize: 54,
    fontWeight: 800,
    textAlign: "center",
    fill: "#00b9fc",
  });
  a.add([subject]);
  a.initialize();
  a.commit([{ type: "setMotionDuration", duration: { value: 67, rate: 30 } }]);
  const { id: _id, ...effect } = createEffect("morph", {
    shapeMorph: { ...geometry, sourceFont: { family: "Inter Variable", size: 54, weight: 800 } },
    settings: { progress: 1, stagger: 0, inflate: 0.9, stretch: 3, order: "forward" },
  });
  const preset: MotionAnimationPreset = {
    version: 1,
    id: "morphing-type-reference",
    name: "Inflate & stretch",
    category: "typography",
    duration: 2200,
    effects: [effect],
    channels: [
      {
        target: { kind: "effectSetting", slot: 0, property: "progress" },
        operation: "replace",
        points: [
          { at: 0, value: 0 },
          { at: 1, value: 1 },
        ],
      },
    ],
  };
  a.commit([
    {
      type: "addMotionAnimation",
      trackId: a.track(subject.id),
      preset,
      start: seconds(0),
      duration: seconds(2.2),
    },
  ]);
  return a.finish();
}
