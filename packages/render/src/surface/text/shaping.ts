import type { Glyph } from "opentype.js";
import wasmURL from "harfbuzzjs/hb.wasm?url";
export interface ShapedGlyph {
  glyph: Glyph;
  advance: number;
  dx: number;
  dy: number;
  cluster: number;
}
interface Owned {
  destroy: () => void;
}
interface Buffer extends Owned {
  addText: (text: string) => void;
  guessSegmentProperties: () => void;
  json: () => { g: number; ax: number; dx: number; dy: number; cl: number }[];
}
interface ShapingFont extends Owned {
  setVariations: (coordinates: Record<string, number>) => void;
}
interface HarfBuzz {
  createBlob: (bytes: ArrayBuffer) => Owned;
  createFace: (blob: Owned, index: number) => Owned;
  createFont: (face: Owned) => ShapingFont;
  createBuffer: () => Buffer;
  shape: (font: ShapingFont, buffer: Buffer) => void;
}
let loading: Promise<HarfBuzz> | null = null;
async function runtime(): Promise<HarfBuzz> {
  if (loading) return loading;
  const attempt = (async () => {
    const [{ default: createModule }, { default: createAPI }, response] = await Promise.all([
      import("harfbuzzjs/hb.js"),
      import("harfbuzzjs/hbjs.js"),
      fetch(wasmURL),
    ]);
    if (!response.ok) throw new Error("Unable to load the local font shaping runtime.");
    const module = await createModule({ wasmBinary: new Uint8Array(await response.arrayBuffer()) });
    return createAPI(module) as HarfBuzz;
  })();
  loading = attempt;
  void attempt.catch(() => {
    if (loading === attempt) loading = null;
  });
  return attempt;
}
/** Attempt every native destructor even when an earlier destructor reports a failure. */
function destroyOwned(resources: readonly (Owned | undefined)[], failures: unknown[] = []): void {
  for (const resource of resources) {
    try {
      resource?.destroy();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "Font native resource cleanup failed.");
}
/** HarfBuzz only shapes font metadata; glyph rasterization stays entirely in Three/TSL. */
export async function createShaper(bytes: ArrayBuffer, getGlyph: (index: number) => Glyph) {
  const api = await runtime();
  let blob: Owned | undefined, face: Owned | undefined, font: ShapingFont;
  try {
    blob = api.createBlob(bytes);
    face = api.createFace(blob, 0);
    font = api.createFont(face);
  } catch (error) {
    destroyOwned([face, blob], [error]);
    throw error;
  }
  let closed = false;
  return {
    shape(text: string, weight: number): ShapedGlyph[] {
      if (closed) throw new Error("Font shaper is disposed.");
      font.setVariations({ wght: weight, opsz: 14 });
      const buffer = api.createBuffer();
      let shaped: ShapedGlyph[];
      try {
        buffer.addText(text.normalize("NFC"));
        buffer.guessSegmentProperties();
        api.shape(font, buffer);
        shaped = buffer.json().map((item) => ({
          glyph: getGlyph(item.g),
          advance: item.ax,
          dx: item.dx,
          dy: item.dy,
          cluster: item.cl,
        }));
      } catch (error) {
        destroyOwned([buffer], [error]);
        throw error;
      }
      destroyOwned([buffer]);
      return shaped;
    },
    dispose() {
      if (closed) return;
      closed = true;
      destroyOwned([font, face, blob]);
    },
  };
}
