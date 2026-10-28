import {
  createEffect,
  createLayer,
  createPage,
  type Composition,
  type Layer,
  type EffectType,
} from "@musart/core";

export const TECHNO_ARTBOARD_NAME = "AFTERHOURS — Techno";
/** Original editable artwork: analytical text, vector wireframes and isolated GPU effects. */
export function createTechnoArtboard(id: () => string = () => crypto.randomUUID()): Composition {
  const layers: Layer[] = [];
  const add = (kind: Layer["kind"], name: string, patch: Partial<Layer>) => {
    const layer = createLayer(kind, { id: id(), name, ...patch });
    layers.push(layer);
    return layer;
  };
  const fx = (type: EffectType, amount: number, scale = 4) =>
    createEffect(type, { id: id(), amount, scale });
  const text = (
    name: string,
    content: string,
    x: number,
    y: number,
    width: number,
    fontSize: number,
    patch: Partial<Layer> = {},
  ) =>
    add("text", name, {
      text: content,
      x,
      y,
      width,
      height: fontSize * 1.5,
      fontSize,
      fontFamily: "Roboto Mono",
      fontWeight: 400,
      letterSpacing: 0,
      fill: "#f2f5f1",
      ...patch,
    });
  const acid = "#d5ff46",
    cyan = "#31e6d7",
    ink = "#080b12";

  const texture = add("group", "Atmosphere / texture", {
    width: 1080,
    height: 1920,
    effects: [fx("grain", 0.16, 1)],
  });
  add("rectangle", "Near-black paper", {
    parentId: texture.id,
    width: 1080,
    height: 1920,
    fill: ink,
  });
  for (let index = 0; index < 29; index++)
    add("rectangle", `Grid / vertical ${index + 1}`, {
      parentId: texture.id,
      x: 42 + index * 36,
      y: 0,
      width: 1,
      height: 1920,
      fill: "#485266",
      opacity: 0.12,
    });
  for (let index = 0; index < 17; index++)
    add("rectangle", `Grid / horizontal ${index + 1}`, {
      parentId: texture.id,
      x: 0,
      y: index * 120,
      width: 1080,
      height: 1,
      fill: "#485266",
      opacity: 0.12,
    });
  add("ellipse", "Violet glow", {
    parentId: texture.id,
    x: 470,
    y: 480,
    width: 720,
    height: 980,
    fill: "#5731c8",
    opacity: 0.38,
    effects: [fx("blur", 0.8, 100)],
  });
  add("ellipse", "Cyan glow", {
    parentId: texture.id,
    x: -140,
    y: 880,
    width: 700,
    height: 580,
    fill: cyan,
    opacity: 0.16,
    effects: [fx("blur", 0.8, 100)],
  });

  text("Edition / masthead", "MUSART  /  EXPERIMENTAL SERIES", 56, 40, 800, 18, {
    fill: acid,
    letterSpacing: 1.8,
  });
  text("Edition / code", "VOL.09", 872, 40, 150, 18, { textAlign: "right", fill: acid });
  add("rectangle", "Header rule", { x: 56, y: 92, width: 968, height: 2, fill: acid });

  text("Hero / AFTER", "AFTER", 46, 104, 1000, 350, {
    fontFamily: "Bebas Neue",
    height: 355,
    letterSpacing: -4,
    fillGradient: {
      kind: "linear",
      angle: -16,
      stops: [
        { offset: 0, color: "#f7ffe5" },
        { offset: 0.56, color: acid },
        { offset: 1, color: cyan },
      ],
    },
  });
  text("Hero / HOURS", "HOURS", 45, 371, 1000, 338, {
    fontFamily: "Bebas Neue",
    height: 350,
    letterSpacing: -2,
    fillGradient: {
      kind: "linear",
      angle: 12,
      stops: [
        { offset: 0, color: cyan },
        { offset: 0.52, color: "#f7ffe5" },
        { offset: 1, color: "#b4a0ff" },
      ],
    },
  });
  text("Hero / manifesto", "INDEPENDENT ELECTRONIC MUSIC  /  NO COMFORT ZONE", 60, 710, 970, 16, {
    fill: "#bdc4d1",
    letterSpacing: 1,
  });

  const orb = add("group", "Signal sphere / isolated", {
    x: 102,
    y: 780,
    width: 876,
    height: 690,
    effects: [fx("dither", 0.18, 2)],
  });
  const centerX = 438,
    centerY = 345,
    radius = 333;
  add("ellipse", "Sphere silhouette", {
    parentId: orb.id,
    x: centerX - radius,
    y: centerY - radius,
    width: radius * 2,
    height: radius * 2,
    fill: "#11152a",
    stroke: cyan,
    strokeWidth: 1.5,
  });
  for (let index = -10; index <= 10; index++) {
    const angle = (index * Math.PI) / 22,
      width = Math.max(10, Math.cos(angle) * radius * 2);
    add("ellipse", `Longitude ${index + 11}`, {
      parentId: orb.id,
      x: centerX - width / 2,
      y: centerY - radius,
      width,
      height: radius * 2,
      fill: "transparent",
      stroke: index % 3 ? "#8b7aff" : cyan,
      strokeWidth: index % 3 ? 1.4 : 2,
      opacity: 0.75,
      rotation: -17,
    });
  }
  for (let index = -6; index <= 6; index++) {
    const ratio = index / 7,
      width = Math.sqrt(1 - ratio * ratio) * radius * 2;
    add("ellipse", `Latitude ${index + 7}`, {
      parentId: orb.id,
      x: centerX - width / 2,
      y: centerY + ratio * radius - 25,
      width,
      height: 50,
      fill: "transparent",
      stroke: "#a9c8ff",
      strokeWidth: 1.1,
      opacity: 0.7,
      rotation: -17,
    });
  }
  add("ellipse", "Orbit / acid", {
    x: 12,
    y: 1010,
    width: 1050,
    height: 180,
    rotation: -24,
    fill: "transparent",
    stroke: acid,
    strokeWidth: 3,
  });
  add("ellipse", "Orbit / violet", {
    x: 56,
    y: 995,
    width: 965,
    height: 230,
    rotation: 21,
    fill: "transparent",
    stroke: "#c9a7ff",
    strokeWidth: 1.3,
    opacity: 0.8,
  });

  const markers = add("group", "Technical annotations", { width: 1080, height: 1920 });
  for (const [index, y] of [838, 1034, 1266, 1408].entries()) {
    add("rectangle", `Annotation rule ${index + 1}`, {
      parentId: markers.id,
      x: 60,
      y,
      width: 90,
      height: 1,
      fill: acid,
    });
    add("rectangle", `Annotation tick ${index + 1}`, {
      parentId: markers.id,
      x: 60,
      y: y - 5,
      width: 1,
      height: 11,
      fill: acid,
    });
    text(
      `Annotation ${index + 1}`,
      ["SIGNAL: 09.31", "PHASE LOCKED", "127.5 BPM", "NO SIGNAL LOST"][index]!,
      60,
      y + 12,
      260,
      13,
      { parentId: markers.id, fill: acid, letterSpacing: 0.5 },
    );
  }
  text("Side caption", "TRANSMISSION  /  AFTER DARK", 704, 1078, 620, 14, {
    rotation: 90,
    fill: "#bdc4d1",
    height: 24,
    letterSpacing: 2,
  });
  text("Sphere label", "A  /  H", 683, 1377, 320, 44, {
    fontFamily: "Space Grotesk",
    textAlign: "right",
    fontWeight: 600,
    fill: acid,
    letterSpacing: 2,
  });

  add("rectangle", "Program band", { x: 56, y: 1514, width: 968, height: 196, fill: acid });
  text("Program / label", "LIVE ACTS + EXTENDED SETS", 80, 1533, 920, 16, {
    fill: ink,
    letterSpacing: 2,
  });
  text(
    "Program / artists",
    "PHASE ZERO  /  DUAL SINE\nABSENT MIND  /  MODULAR STATE",
    80,
    1572,
    920,
    31,
    {
      fontFamily: "Space Grotesk",
      fill: ink,
      fontWeight: 600,
      height: 112,
      lineHeight: 1.35,
      letterSpacing: -0.5,
    },
  );
  text("Date / headline", "31.10.26", 51, 1720, 710, 105, {
    fontFamily: "Bebas Neue",
    height: 140,
    fill: "#f7ffe5",
    letterSpacing: 1,
  });
  text("Venue / details", "WAREHOUSE 09\nPARIS  /  23:00—08:00", 656, 1760, 365, 19, {
    fill: "#c7ced8",
    textAlign: "right",
    height: 72,
    lineHeight: 1.45,
  });
  add("rectangle", "Footer rule", { x: 56, y: 1842, width: 968, height: 1, fill: "#717d8e" });
  text("Footer / statement", "NO PHONES. JUST FREQUENCIES.", 57, 1861, 630, 14, {
    fill: "#9ca7b7",
    letterSpacing: 1,
  });
  const barcode = add("group", "Edition barcode", { x: 784, y: 1862, width: 240, height: 32 });
  for (let index = 0; index < 58; index++)
    if ((index * 17 + 11) % 7 > 2)
      add("rectangle", `Barcode bar ${index + 1}`, {
        parentId: barcode.id,
        x: index * 4,
        y: 0,
        width: index % 3 ? 1 : 3,
        height: 30,
        fill: "#e2ebf4",
      });
  return createPage({
    id: id(),
    name: TECHNO_ARTBOARD_NAME,
    width: 1080,
    height: 1920,
    background: ink,
    margins: { top: 40, right: 56, bottom: 40, left: 56 },
    rulers: true,
    layers,
    guides: [
      { id: id(), axis: "x", position: 56 },
      { id: id(), axis: "x", position: 1024 },
      { id: id(), axis: "y", position: 1514 },
    ],
  });
}
