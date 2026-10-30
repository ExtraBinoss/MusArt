import { createEffect, createMotionEasingPreset as ease } from "@musart/core";
import { TemplateAuthor, seconds } from "../motion/author";

/** Original artwork, authored entirely through the public headless command port. */
export function createOrbitStudy() {
  const a = new TemplateAuthor("orbit-study", "Orbit Study", 1080, 1080);
  a.commit([{ type: "updatePage", patch: { background: "#17191f" } }]);
  const field = createEffect("gradient", {
    id: "orbit-field",
    time: 0,
    settings: { style: "aurora", color0: "#f1948a", color1: "#7658dd", color2: "#f2ce85" },
  });
  a.add([
    a.layer("text", "orbit-kicker", "Edition", {
      x: 64,
      y: 44,
      width: 920,
      height: 36,
      text: "MUSART     /     MOTION STUDIES     /     002",
      fontFamily: "Space Grotesk",
      fontSize: 18,
      letterSpacing: 2,
      fill: "#b5b3bf",
    }),
    a.layer("text", "orbit-title", "Orbit Study", {
      x: 54,
      y: 115,
      width: 980,
      height: 360,
      text: "ORBIT\nSTUDY",
      fontFamily: "Space Grotesk",
      fontWeight: 700,
      fontSize: 166,
      lineHeight: 0.92,
      letterSpacing: -8,
      fill: "#f4eadd",
    }),
    a.layer("ellipse", "orbit-ring", "Orbital path", {
      x: 130,
      y: 475,
      width: 820,
      height: 470,
      rotation: -24,
      fill: "#ffffff00",
      stroke: "#837a93",
      strokeWidth: 2,
    }),
    a.layer("ellipse", "orbit-field-layer", "Live color field", {
      x: 358,
      y: 386,
      width: 640,
      height: 640,
      effects: [field],
    }),
    a.layer("ellipse", "orbit-moon", "Small moon", {
      x: 154,
      y: 688,
      width: 98,
      height: 98,
      fill: "#eedfc8",
    }),
    a.layer("text", "orbit-caption", "Caption", {
      x: 64,
      y: 968,
      width: 620,
      height: 42,
      text: "COLOR IN CONSTANT CONVERSATION.",
      fontFamily: "Space Grotesk",
      fontSize: 18,
      letterSpacing: 1.5,
      fill: "#b5b3bf",
    }),
    a.layer("text", "orbit-duration", "Duration", {
      x: 840,
      y: 968,
      width: 170,
      height: 42,
      text: "05 SEC / LOOP",
      fontFamily: "Space Grotesk",
      fontSize: 17,
      textAlign: "right",
      fill: "#b5b3bf",
    }),
  ]);
  a.initialize();
  a.commit([
    ...a.keys(
      { kind: "effect", layerId: "orbit-field-layer", effectId: field.id, property: "time" },
      [
        [0, 0],
        [5, 5],
      ],
    ),
    ...a.layerKeys("orbit-field-layer", "x", [
      [0, 358],
      [2.5, 306, ease("easeInOut")],
      [5, 358, ease("easeInOut")],
    ]),
    ...a.layerKeys("orbit-moon", "y", [
      [0, 688],
      [2.5, 760, ease("gentle")],
      [5, 688, ease("easeInOut")],
    ]),
    ...a.layerKeys("orbit-ring", "rotation", [
      [0, -24],
      [2.5, -16, ease("easeInOut")],
      [5, -24, ease("easeInOut")],
    ]),
  ]);
  return a.finish();
}

export function createPaperMotion() {
  const a = new TemplateAuthor("paper-motion", "Paper Motion", 1080, 1350);
  a.commit([{ type: "updatePage", patch: { background: "#eae2d4" } }]);
  a.add([
    a.layer("text", "paper-edition", "Edition", {
      x: 64,
      y: 44,
      width: 940,
      height: 36,
      text: "MUSART  /  FORM & FEELING",
      fontFamily: "Space Grotesk",
      fontSize: 20,
      letterSpacing: 2,
      fill: "#4c5246",
    }),
    a.layer("text", "paper-title", "Paper Motion", {
      x: 52,
      y: 126,
      width: 976,
      height: 300,
      text: "PAPER\nMOTION",
      fontFamily: "Space Grotesk",
      fontWeight: 700,
      fontSize: 150,
      lineHeight: 0.9,
      letterSpacing: -7,
      fill: "#293c32",
    }),
    a.layer("group", "paper-collage", "Paper collage", { x: 140, y: 490, width: 800, height: 650 }),
    a.layer("rectangle", "paper-coral", "Coral paper", {
      parentId: "paper-collage",
      x: 40,
      y: 60,
      width: 470,
      height: 540,
      fill: "#ca715a",
      rotation: -11,
    }),
    a.layer("rectangle", "paper-blue", "Indigo paper", {
      parentId: "paper-collage",
      x: 350,
      y: 44,
      width: 350,
      height: 500,
      fill: "#626f9a",
      rotation: 10,
    }),
    a.layer("ellipse", "paper-sun", "Sun", {
      parentId: "paper-collage",
      x: 212,
      y: 188,
      width: 360,
      height: 360,
      fill: "#efd18d",
    }),
    a.layer("ellipse", "paper-hole", "Cut-out", {
      parentId: "paper-collage",
      x: 302,
      y: 278,
      width: 180,
      height: 180,
      fill: "#293c32",
    }),
    a.layer("text", "paper-footer", "Footer", {
      x: 64,
      y: 1200,
      width: 940,
      height: 80,
      text: "A STUDY IN SMALL MOVEMENTS.\nGROUPED. LAYERED. ENTIRELY EDITABLE.",
      fontFamily: "Space Grotesk",
      fontSize: 19,
      lineHeight: 1.5,
      letterSpacing: 1,
      fill: "#4c5246",
    }),
  ]);
  a.initialize();
  a.commit([
    ...a.layerKeys("paper-collage", "rotation", [
      [0, -3],
      [2.5, 3, ease("gentle")],
      [5, -3, ease("easeInOut")],
    ]),
    ...a.layerKeys("paper-coral", "rotation", [
      [0, -11],
      [2.5, -4, ease("gentle")],
      [5, -11, ease("easeInOut")],
    ]),
    ...a.layerKeys("paper-blue", "y", [
      [0, 44],
      [2.5, 12, ease("easeInOut")],
      [5, 44, ease("easeInOut")],
    ]),
    {
      type: "applyMotionTransition",
      layerId: "paper-title",
      style: "diagonal-wipe",
      placement: "in",
      duration: seconds(0.7),
      easing: ease("easeOut"),
    },
    {
      type: "applyMotionTransition",
      layerId: "paper-footer",
      style: "fade",
      placement: "in",
      duration: seconds(1.1),
      easing: ease("easeInOut"),
    },
  ]);
  return a.finish();
}

export function createColorfield() {
  const a = new TemplateAuthor("colorfield", "Colorfield", 1080, 1350);
  a.commit([{ type: "updatePage", patch: { background: "#ede8df" } }]);
  const colors = ["#ca715a", "#e8b766", "#657b67", "#768ab0", "#4b536e", "#ad8295"];
  const shapes = colors.map((fill, index) =>
    a.layer(
      index % 2 ? "ellipse" : "rectangle",
      `colorfield-shape-${index}`,
      `Color study ${index + 1}`,
      {
        x: 64 + (index % 2) * 480,
        y: 246 + Math.floor(index / 2) * 302,
        width: 456,
        height: 280,
        fill,
        radius: index % 2 ? 0 : 28,
        ...(index === 2
          ? {
              fillGradient: {
                kind: "linear" as const,
                angle: 30,
                stops: [
                  { offset: 0, color: fill },
                  { offset: 1, color: "#afbb92" },
                ],
              },
            }
          : {}),
      },
    ),
  );
  a.add([
    a.layer("text", "colorfield-title", "Colorfield", {
      x: 56,
      y: 64,
      width: 970,
      height: 140,
      text: "COLORFIELD.",
      fontFamily: "Space Grotesk",
      fontWeight: 700,
      fontSize: 112,
      letterSpacing: -5,
      fill: "#30342f",
    }),
    ...shapes,
    a.layer("text", "colorfield-footer", "Edition", {
      x: 64,
      y: 1210,
      width: 940,
      height: 66,
      text: "FORM, COLOR, POSSIBILITY.\nMUSART / SHAPE STUDIES 003",
      fontFamily: "Space Grotesk",
      fontSize: 20,
      letterSpacing: 1,
      lineHeight: 1.5,
      fill: "#676a61",
    }),
  ]);
  return a.finish();
}
