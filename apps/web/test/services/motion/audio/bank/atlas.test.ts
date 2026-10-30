import { afterEach, expect, it, vi } from "vitest";
import { prepareBankAtlas } from "../../../../../src/services/motion/audio/bank/atlas";
import { generateBankShapes } from "../../../../../../../scripts/audio/bank";
afterEach(() => vi.unstubAllGlobals());
it("rasterizes two bounded DPR-aware Canvas atlases without any pixel read API", () => {
  const fills = vi.fn(),
    transforms = vi.fn(),
    bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    "Path2D",
    class {
      moveTo() {}
      lineTo() {}
      quadraticCurveTo() {}
      closePath() {}
    },
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      getContext() {
        return { fillStyle: "", setTransform: transforms, fill: fills };
      }
      transferToImageBitmap() {
        const bitmap = { close: vi.fn() };
        bitmaps.push(bitmap);
        return bitmap;
      }
    },
  );
  const value = prepareBankAtlas({
    id: 1,
    type: "atlas",
    shapes: generateBankShapes().shapes,
    width: 128,
    height: 16,
    dpr: 2,
    palette: { neutral: "#888", active: "#0f0" },
  });
  expect(value.width).toBe(256);
  expect(value.height).toBe(32);
  expect(fills).toHaveBeenCalledTimes(30);
  expect(transforms).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 448);
  expect(bitmaps).toHaveLength(2);
  expect(() =>
    prepareBankAtlas({
      id: 2,
      type: "atlas",
      shapes: generateBankShapes().shapes,
      width: 1e8,
      height: 16,
      dpr: 2,
      palette: { neutral: "#888", active: "#0f0" },
    }),
  ).toThrow("bounded size");
});
