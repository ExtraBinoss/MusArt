import { createEffect, TRANSITION_CATALOG, type MotionPropertyTarget } from "@musart/core";
import { TemplateAuthor, seconds } from "../motion/author";

/** One reusable layer, thirty independent occurrences, all authored through public commands. */
export function createTransitionAtlas() {
  const a = new TemplateAuthor("transition-atlas", "Transition Atlas", 1440, 960);
  const effect = createEffect("transition", {
    id: "atlas-transition",
    settings: { style: "fade", progress: 1 },
  });
  a.commit([{ type: "updatePage", patch: { background: "#1b1d24" } }]);
  a.add([
    a.layer("text", "atlas-title", "Title", {
      x: 60,
      y: 40,
      width: 1300,
      height: 96,
      text: "THE TRANSITION ATLAS",
      fontFamily: "Space Grotesk",
      fontWeight: 700,
      fontSize: 72,
      letterSpacing: -3,
      fill: "#f2e9da",
    }),
    a.layer("text", "atlas-description", "Description", {
      x: 64,
      y: 154,
      width: 1300,
      height: 38,
      text: "30 OPERATORS   /   1 SHARED LAYER   /   INDEPENDENT KEYFRAMES",
      fontFamily: "Space Grotesk",
      fontSize: 19,
      letterSpacing: 1.2,
      fill: "#a8a5b4",
    }),
    a.layer("group", "atlas-stage", "Transition stage — 30 occurrences", {
      x: 190,
      y: 240,
      width: 1060,
      height: 560,
      effects: [effect],
    }),
    a.layer("rectangle", "atlas-card", "Cream card", {
      parentId: "atlas-stage",
      width: 1060,
      height: 560,
      radius: 30,
      fill: "#e9e2d3",
    }),
    a.layer("ellipse", "atlas-coral", "Coral circle", {
      parentId: "atlas-stage",
      x: 80,
      y: 70,
      width: 420,
      height: 420,
      fill: "#d38570",
    }),
    a.layer("rectangle", "atlas-lilac", "Lilac slab", {
      parentId: "atlas-stage",
      x: 552,
      y: 80,
      width: 390,
      height: 400,
      fill: "#8987bb",
      radius: 20,
      rotation: 10,
    }),
    a.layer("ellipse", "atlas-sun", "Sun cutout", {
      parentId: "atlas-stage",
      x: 670,
      y: 186,
      width: 190,
      height: 190,
      fill: "#e9ca7c",
    }),
    a.layer("text", "atlas-label", "Current operator", {
      x: 64,
      y: 860,
      width: 1200,
      height: 55,
      text: "01 / FADE",
      fontFamily: "Space Grotesk",
      fontSize: 30,
      letterSpacing: 1.5,
      fill: "#f2e9da",
    }),
  ]);
  a.initialize();
  a.commit([
    { type: "setMotionDuration", duration: seconds(60) },
    {
      type: "setMotionTrackRange",
      trackId: a.track("atlas-stage"),
      start: seconds(0),
      end: seconds(2),
    },
  ]);
  const target = (property: string): MotionPropertyTarget => ({
    kind: "effectSetting",
    layerId: "atlas-stage",
    effectId: effect.id,
    property,
  });
  TRANSITION_CATALOG.forEach(({ id }, index) => {
    if (index)
      a.commit([
        {
          type: "addMotionOccurrence",
          layerId: "atlas-stage",
          start: seconds(index * 2),
          end: seconds(index * 2 + 2),
        },
      ]);
    const track = a.engine
      .getSnapshot()
      .project.pages[0]!.motion!.tracks.find(
        (track) =>
          track.layerId === "atlas-stage" && track.start.value / track.start.rate === index * 2,
      )!;
    a.commit([
      ...a
        .keys(target("progress"), [
          [index * 2, 0],
          [index * 2 + 0.65, 1],
          [index * 2 + 1.35, 1],
          [index * 2 + 2, 0],
        ])
        .map((command) => ({ ...command, trackId: track.id })),
      {
        type: "upsertMotionKeyframe",
        trackId: track.id,
        target: target("style"),
        time: seconds(index * 2),
        value: id,
        easing: { type: "hold" },
      },
      ...a.layerKeys("atlas-label", "text", [
        [
          index * 2,
          `${String(index + 1).padStart(2, "0")} / ${id.replaceAll("-", " ").toUpperCase()}`,
          { type: "hold" },
        ],
      ]),
    ]);
  });
  return a.finish();
}
