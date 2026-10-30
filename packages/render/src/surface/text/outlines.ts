import type { Face, Font, PathCommand } from "text-shaper";
import type { ShapedGlyph } from "./shaping";
import { createMetricFace } from "./metrics";
export type { PathCommand } from "text-shaper";
export interface OutlineBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface OutlinePath {
  commands: PathCommand[];
  getBoundingBox(): OutlineBounds;
}
export interface OutlineGlyph {
  index: number;
  name?: string | null;
  unicode?: number;
  advanceWidth?: number;
  getPath(
    x?: number,
    y?: number,
    size?: number,
    options?: { xScale?: number; yScale?: number },
  ): OutlinePath;
}
export interface OutlineFont {
  unitsPerEm: number;
  ascender: number;
  glyphs: { get(index: number): OutlineGlyph };
  charToGlyph(text: string): OutlineGlyph;
  stringToGlyphs(text: string): OutlineGlyph[];
  getKerningValue(left: OutlineGlyph, right: OutlineGlyph): number;
  variation?: {
    getTransform(glyph: OutlineGlyph, coordinates: Record<string, number>): OutlineGlyph;
  };
  shape?: (text: string, weight: number) => ShapedGlyph[];
}

/** Exact Bézier extrema keep frame placement independent of a parser's control-point hull. */
export function outlineBounds(commands: readonly PathCommand[]): OutlineBounds {
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  let current = [0, 0],
    start = current;
  const include = (x: number, y: number) => {
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  };
  for (const command of commands) {
    if (command.type === "Z") {
      current = start;
      continue;
    }
    if (command.type === "M") {
      start = current = [command.x, command.y];
      continue;
    }
    const end = [command.x, command.y];
    include(current[0]!, current[1]!);
    include(end[0]!, end[1]!);
    if (command.type === "Q" || command.type === "C") {
      const first = [command.x1, command.y1];
      for (let axis = 0; axis < 2; axis++) {
        const a = current[axis]!,
          b = first[axis]!,
          d = end[axis]!;
        let roots: number[];
        if (command.type === "Q") roots = [(a - b) / (a - 2 * b + d)];
        else {
          const c = axis ? command.y2 : command.x2;
          const qa = -a + 3 * b - 3 * c + d,
            qb = 2 * (a - 2 * b + c),
            qc = b - a;
          const discriminant = qb * qb - 4 * qa * qc;
          roots =
            Math.abs(qa) < 1e-12
              ? [-qc / qb]
              : discriminant < 0
                ? []
                : [
                    (-qb + Math.sqrt(discriminant)) / (2 * qa),
                    (-qb - Math.sqrt(discriminant)) / (2 * qa),
                  ];
        }
        for (const t of roots)
          if (t > 0 && t < 1) {
            const s = 1 - t;
            const point = current.map((p, i) =>
              command.type === "Q"
                ? s * s * p + 2 * s * t * first[i]! + t * t * end[i]!
                : s ** 3 * p +
                  3 * s * s * t * first[i]! +
                  3 * s * t * t * (i ? command.y2 : command.x2) +
                  t ** 3 * end[i]!,
            );
            include(point[0]!, point[1]!);
          }
      }
    }
    current = end;
  }
  return x1 === Infinity ? { x1: 0, y1: 0, x2: 0, y2: 0 } : { x1, y1, x2, y2 };
}

type API = Pick<
  typeof import("text-shaper"),
  "Face" | "getGlyphDelta" | "getGlyphPath" | "getGlyphPathWithVariation"
>;
/** A bounded metadata adapter; outlines remain curves in font units, never pixels. */
export function createOutlineFont(native: Font, api: API): { font: OutlineFont; dispose(): void } {
  if (!(native.hasTable(0x676c7966) && native.hasTable(0x6c6f6361)) && !native.isCFF)
    throw Error("The font has no supported outline table.");
  if (
    !Number.isSafeInteger(native.numGlyphs) ||
    native.numGlyphs < 1 ||
    native.numGlyphs > 65535 ||
    !Number.isFinite(native.unitsPerEm) ||
    native.unitsPerEm < 16 ||
    native.unitsPerEm > 16384
  )
    throw Error("Invalid outline font metrics.");
  let owner:
    | { native: Font; face: Face; axesKey: string; glyphs: Map<string, OutlineGlyph> }
    | undefined = {
    native,
    face: createMetricFace(native, api),
    axesKey: "",
    glyphs: new Map(),
  };
  const state = () => {
    if (!owner) throw Error("Font outlines are disposed.");
    return owner;
  };
  const glyph = (index: number, coordinates?: Record<string, number>) => {
    const current = state();
    if (!Number.isInteger(index) || index < 0 || index >= current.native.numGlyphs)
      throw Error("Invalid font glyph index.");
    const key = coordinates ? `${index}:${JSON.stringify(coordinates)}` : String(index);
    const cached = current.glyphs.get(key);
    if (cached) {
      current.glyphs.delete(key);
      current.glyphs.set(key, cached);
      return cached;
    }
    let axes: number[] | undefined,
      advanceWidth = current.native.advanceWidth(index);
    if (coordinates && current.native.isVariable) {
      const axesKey = JSON.stringify(coordinates);
      if (current.axesKey !== axesKey) {
        current.face.setVariations(coordinates);
        current.axesKey = axesKey;
      }
      axes = [...current.face.normalizedCoords];
      advanceWidth = current.face.advanceWidth(index);
    }
    let raw: PathCommand[] | undefined;
    const output: OutlineGlyph = {
      index,
      advanceWidth,
      getPath(x = 0, y = 0, size = 72, options = {}) {
        const { native: source } = state();
        if (!raw) {
          const path = axes?.some((value) => value !== 0)
            ? api.getGlyphPathWithVariation(source, index, axes)
            : api.getGlyphPath(source, index);
          if (!path) throw Error("The requested glyph outline is unavailable.");
          raw = path.commands;
        }
        const sx = options.xScale ?? size / source.unitsPerEm,
          sy = options.yScale ?? size / source.unitsPerEm;
        const commands = raw.map((command): PathCommand => {
          if (command.type === "Z") return { type: "Z" };
          const end = { x: x + command.x * sx, y: y - command.y * sy };
          if (command.type === "C")
            return {
              type: "C",
              ...end,
              x1: x + command.x1 * sx,
              y1: y - command.y1 * sy,
              x2: x + command.x2 * sx,
              y2: y - command.y2 * sy,
            };
          if (command.type === "Q")
            return { type: "Q", ...end, x1: x + command.x1 * sx, y1: y - command.y1 * sy };
          return { type: command.type, ...end };
        });
        return { commands, getBoundingBox: () => outlineBounds(commands) };
      },
    };
    current.glyphs.set(key, output);
    if (current.glyphs.size > 512) current.glyphs.delete(current.glyphs.keys().next().value!);
    return output;
  };
  const font: OutlineFont = {
    unitsPerEm: native.unitsPerEm,
    ascender: native.ascender,
    glyphs: { get: (index) => glyph(index) },
    charToGlyph: (text) => glyph(state().native.glyphIdForChar(text)),
    stringToGlyphs: (text) =>
      Array.from(text, (character) => glyph(state().native.glyphIdForChar(character))),
    getKerningValue: () => 0,
    variation: { getTransform: (original, coordinates) => glyph(original.index, coordinates) },
  };
  return {
    font,
    dispose() {
      owner?.glyphs.clear();
      owner = undefined;
    },
  };
}
