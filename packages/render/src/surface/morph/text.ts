import {
  prepareMorphShape,
  resolveEffectSettings,
  type Effect,
  type Layer,
  type MorphContour,
  type MorphPoint,
  type ShapeMorph,
} from "@musart/core";
import type { OutlineFont, PathCommand } from "../text/outlines";
import type { PlacedGlyph } from "../text/layout";
import { quadraticCurves } from "../text/curves";

const signedArea = (points: readonly MorphPoint[]) =>
  points.reduce((a, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return a + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
function contours(
  commands: PathCommand[],
  box: { x1: number; y1: number; x2: number; y2: number },
): MorphContour[] {
  const groups: PathCommand[][] = [];
  for (const command of commands) {
    if (command.type === "M") groups.push([]);
    groups.at(-1)?.push(command);
  }
  const points = groups
    .map((group) =>
      quadraticCurves(group).flatMap((curve) =>
        Array.from({ length: 4 }, (_, i): MorphPoint => {
          const t = i / 4,
            s = 1 - t;
          return [
            (s * s * curve.p0[0] + 2 * s * t * curve.p1[0] + t * t * curve.p2[0] - box.x1) /
              (box.x2 - box.x1),
            (s * s * curve.p0[1] + 2 * s * t * curve.p1[1] + t * t * curve.p2[1] - box.y1) /
              (box.y2 - box.y1),
          ];
        }),
      ),
    )
    .filter((loop) => loop.length >= 3);
  const outer = points.reduce(
    (best, p) => (Math.abs(signedArea(p)) > Math.abs(signedArea(best)) ? p : best),
    points[0] ?? [],
  );
  const sign = Math.sign(signedArea(outer));
  return points.map((loop) => ({ hole: Math.sign(signedArea(loop)) !== sign, points: loop }));
}
function inflateContours(contours: MorphContour[], amount: number): MorphContour[] {
  const target = contours.map((contour) => {
    const xs = contour.points.map((p) => p[0]),
      ys = contour.points.map((p) => p[1]);
    const left = Math.min(...xs),
      top = Math.min(...ys),
      width = Math.max(...xs) - left,
      height = Math.max(...ys) - top;
    const center = contour.points.reduce<MorphPoint>(
      (c, p) => [c[0] + p[0] / contour.points.length, c[1] + p[1] / contour.points.length],
      [0, 0],
    );
    if (contour.hole)
      return {
        ...contour,
        points: contour.points.map((p): MorphPoint => [
          center[0] + (p[0] - center[0]) * 0.25,
          0.68 + (p[1] - center[1]) * 0.25,
        ]),
      };
    const exponent = Math.abs(signedArea(contour.points)) > 0.7 ? 2.5 : 4;
    return {
      ...contour,
      points: Array.from({ length: 128 }, (_, index): MorphPoint => {
        const angle = (index / 128) * Math.PI * 2,
          c = Math.cos(angle),
          t = Math.sin(angle);
        return [
          left + width * (0.5 + Math.sign(c) * Math.abs(c) ** (2 / exponent) * 0.5),
          top + height * (0.5 + Math.sign(t) * Math.abs(t) ** (2 / exponent) * 0.5),
        ];
      }),
    };
  });
  const paired = prepareMorphShape([
    { at: 0, box: [0, 0, 1, 1], contours },
    { at: 1, box: [0, 0, 1, 1], contours: target },
  ]);
  return paired[0]!.contours.map((contour, index) => ({
    ...contour,
    points: contour.points.map((point, pi): MorphPoint => {
      const end = paired[1]!.contours[index]!.points[pi]!;
      return [point[0] + (end[0] - point[0]) * amount, point[1] + (end[1] - point[1]) * amount];
    }),
  }));
}
/** Font shaping remains native and editable; arbitrary contour targets use the same renderer. */
export function textMorph(
  layer: Layer,
  effect: Effect,
  font: OutlineFont,
  layout: PlacedGlyph[],
): ShapeMorph {
  const authored = effect.shapeMorph,
    sourceFont = authored?.sourceFont;
  if (
    authored &&
    (authored.sourceText === undefined || authored.sourceText === layer.text) &&
    (!sourceFont ||
      (sourceFont.family === layer.fontFamily &&
        sourceFont.weight === layer.fontWeight &&
        sourceFont.size === layer.fontSize))
  )
    return authored;
  const settings = resolveEffectSettings(effect),
    scale = layer.fontSize / font.unitsPerEm;
  const glyphs = layout
    .map(({ glyph, x, baseline }) => {
      const path = glyph.getPath(0, 0, font.unitsPerEm, { xScale: 1, yScale: 1 }),
        bounds = path.getBoundingBox();
      return {
        path,
        bounds,
        x: x + bounds.x1 * scale,
        y: baseline + bounds.y1 * scale,
        w: (bounds.x2 - bounds.x1) * scale,
        h: (bounds.y2 - bounds.y1) * scale,
      };
    })
    .filter((glyph) => glyph.w > 0 && glyph.h > 0);
  if (!glyphs.length) throw Error("Morph needs visible text outlines");
  const left = Math.min(...glyphs.map((g) => g.x)),
    top = Math.min(...glyphs.map((g) => g.y)),
    right = Math.max(...glyphs.map((g) => g.x + g.w)),
    bottom = Math.max(...glyphs.map((g) => g.y + g.h));
  const grow = Math.min(
    1.8,
    (layer.width / Math.max(1, right - left)) * 0.96,
    (layer.height / Math.max(1, bottom - top)) * 0.96,
  );
  const stretch = Math.min(
    grow * Number(settings.stretch),
    (layer.height / Math.max(1, bottom - top)) * 0.96,
  );
  const cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  const initial = authored?.shapes.map((shape) => shape.frames[0]!.box);
  const dx = initial
    ? ((Math.min(...initial.map((box) => box[0])) +
        Math.max(...initial.map((box) => box[0] + box[2]))) *
        layer.width) /
        2 -
      cx
    : 0;
  const dy = initial
    ? ((Math.min(...initial.map((box) => box[1])) +
        Math.max(...initial.map((box) => box[1] + box[3]))) *
        layer.height) /
        2 -
      cy
    : 0;
  return {
    version: 1,
    shapes: glyphs.map((g) => {
      const from = contours(g.path.commands, g.bounds);
      return {
        frames: [
          {
            at: 0,
            box: [
              (g.x + dx) / layer.width,
              (g.y + dy) / layer.height,
              g.w / layer.width,
              g.h / layer.height,
            ],
            contours: from,
          },
          {
            at: 1,
            box: [
              (cx + dx + (g.x - cx) * grow) / layer.width,
              (cy + dy + (g.y - cy) * stretch) / layer.height,
              (g.w * grow) / layer.width,
              (g.h * stretch) / layer.height,
            ],
            contours: inflateContours(from, Number(settings.inflate)),
            easing: "easeOut",
          },
        ],
      };
    }),
  };
}
