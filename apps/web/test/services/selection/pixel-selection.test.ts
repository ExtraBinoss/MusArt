import { describe, expect, it, vi } from "vitest";
import { floodMask, maskToDataUrl } from "../../../src/services/selection/pixel-selection";
function pixels(colors: number[][]) {
  return new Uint8ClampedArray(colors.flat());
}
describe("connected magic-wand selection", () => {
  it("retains source alpha and selects only connected pixels inside the color tolerance", () => {
    const image = pixels([
      [10, 10, 10, 255],
      [12, 10, 10, 128],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [10, 10, 10, 255],
    ]);
    const result = floodMask(image, 3, 2, 0, 0, 3);
    expect(Array.from(result.filter((_, index) => index % 4 === 3))).toEqual([
      255, 128, 0, 0, 0, 0,
    ]);
    expect(Array.from(result.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(image.slice(0, 4))).toEqual([10, 10, 10, 255]);
    expect(floodMask(image, 3, 2, 0, 0, 255).filter((_, index) => index % 4 === 3)).toEqual(
      new Uint8ClampedArray([255, 128, 255, 255, 255, 255]),
    );
  });
  it("handles all four neighbors, transparent seeds and clamped fractional coordinates", () => {
    const image = pixels(Array.from({ length: 9 }, () => [40, 50, 60, 255]));
    expect(floodMask(image, 3, 3, 1, 1, 0).filter((_, i) => i % 4 === 3)).toEqual(
      new Uint8ClampedArray(9).fill(255),
    );
    image[3] = 0;
    expect(floodMask(image, 3, 3, -100, -100, -10)).toEqual(new Uint8ClampedArray(36));
    expect(floodMask(image, 3, 3, 99.4, 99.9, 0)[35]).toBe(255);
  });
  it.each([
    [0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [1, 1, NaN, 0, 0],
    [1, 1, 0, Infinity, 0],
    [1, 1, 0, 0, NaN],
  ])("rejects invalid pixel geometry %j", (width, height, x, y, tolerance) => {
    expect(() => floodMask(new Uint8ClampedArray(4), width, height, x, y, tolerance)).toThrow(
      "invalides",
    );
  });
  it("rejects mismatched pixel buffers", () => {
    expect(() => floodMask(new Uint8ClampedArray(2), 1, 1, 0, 0, 0)).toThrow();
  });
  it("encodes masks with an owned pixel buffer and reports missing Canvas capability", () => {
    const putImageData = vi.fn();
    class Pixels {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    }
    vi.stubGlobal("ImageData", Pixels);
    const getContext = (() => ({ putImageData })) as unknown as HTMLCanvasElement["getContext"];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(getContext);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,mask",
    );
    const data = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(maskToDataUrl(data, 1, 1)).toContain("mask");
    const uploaded = putImageData.mock.calls[0]![0] as Pixels;
    expect(uploaded.data).toEqual(data);
    expect(uploaded.data).not.toBe(data);
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    expect(() => maskToDataUrl(data, 1, 1)).toThrow("indisponible");
    vi.unstubAllGlobals();
  });
});
