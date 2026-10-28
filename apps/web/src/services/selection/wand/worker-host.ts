import { floodMask } from "../pixel-selection";
import { selectionContour } from "./contours";
import type { WandRequest, WandResponse, SelectionMode } from "./model";
export const MAX_SELECTION_PIXELS = 16 * 1024 * 1024;
function allMatching(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  tolerance: number,
) {
  const result = new Uint8ClampedArray(data.length),
    seed = (Math.floor(y) * width + Math.floor(x)) * 4,
    limit = Math.max(0, Math.min(255, tolerance)) ** 2 * 3;
  if (!data[seed + 3]) return result;
  for (let offset = 0; offset < data.length; offset += 4)
    if (
      (data[offset]! - data[seed]!) ** 2 +
        (data[offset + 1]! - data[seed + 1]!) ** 2 +
        (data[offset + 2]! - data[seed + 2]!) ** 2 <=
      limit
    ) {
      result[offset] = result[offset + 1] = result[offset + 2] = 255;
      result[offset + 3] = data[offset + 3]!;
    }
  return result;
}
const MODES: readonly SelectionMode[] = ["new", "add", "subtract", "intersect"];
/** One original image, one accepted alpha mask and one replaceable draft per worker. */
export function createWandHost() {
  let source: Extract<WandRequest, { type: "source" }> | null = null,
    accepted: Uint8Array = new Uint8Array(0),
    draft: Uint8Array | null = null;
  function preview(alpha: Uint8Array) {
    return {
      width: source!.width,
      height: source!.height,
      ...selectionContour(alpha, source!.width, source!.height),
    };
  }
  return (request: WandRequest): WandResponse => {
    try {
      if (request.type === "source") {
        if (
          !Number.isSafeInteger(request.width) ||
          !Number.isSafeInteger(request.height) ||
          request.width < 1 ||
          request.height < 1 ||
          request.width * request.height > MAX_SELECTION_PIXELS ||
          request.data.length !== request.width * request.height * 4
        )
          throw Error("Invalid or oversized pixel selection source.");
        source = request;
        accepted = new Uint8Array(request.width * request.height);
        draft = null;
      } else {
        if (!source) throw Error("Pixel selection source is missing.");
        if (request.type === "preview") {
          if (
            ![request.x, request.y, request.tolerance].every(Number.isFinite) ||
            !MODES.includes(request.mode) ||
            typeof request.contiguous !== "boolean"
          )
            throw Error("Invalid pixel selection gesture.");
          const x = Math.max(0, Math.min(source.width - 1, request.x)),
            y = Math.max(0, Math.min(source.height - 1, request.y)),
            region = request.contiguous
              ? floodMask(source.data, source.width, source.height, x, y, request.tolerance)
              : allMatching(source.data, source.width, x, y, request.tolerance);
          draft = new Uint8Array(accepted.length);
          for (let index = 0; index < draft.length; index++) {
            const a = accepted[index]!,
              b = region[index * 4 + 3]!;
            draft[index] =
              request.mode === "new"
                ? b
                : request.mode === "add"
                  ? Math.max(a, b)
                  : request.mode === "subtract"
                    ? Math.round(a * (1 - b / 255))
                    : Math.min(a, b);
          }
        } else if (request.type === "accept") {
          if (draft) accepted = draft;
          draft = null;
        } else if (request.type === "invert") {
          accepted = accepted.map((value) => 255 - value);
          draft = null;
        } else if (request.type === "export") {
          const data = new Uint8ClampedArray(accepted.length * 4);
          for (let index = 0; index < accepted.length; index++) {
            const offset = index * 4;
            data[offset] = data[offset + 1] = data[offset + 2] = accepted[index]!;
            data[offset + 3] = 255;
          }
          return { id: request.id, mask: { data, width: source.width, height: source.height } };
        } else throw Error("Unknown pixel selection request.");
      }
      return { id: request.id, preview: preview(draft ?? accepted) };
    } catch (error) {
      return { id: request.id, error: error instanceof Error ? error.message : String(error) };
    }
  };
}
