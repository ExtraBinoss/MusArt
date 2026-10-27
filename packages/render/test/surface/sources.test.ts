import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayer, type Asset } from "@musart/core";
import {
  clearSourceCache,
  context2d,
  createSurface,
  drawText,
  loadAsset,
  sourcePixels,
} from "../../src/surface/sources";
import { installCanvasMock } from "../canvas-fixture";

const asset: Asset = {
  id: "source",
  name: "photo",
  mime: "image/png",
  width: 4,
  height: 3,
  dataUrl: "data:mock",
};
let context: ReturnType<typeof installCanvasMock>;
beforeEach(() => {
  context = installCanvasMock();
  clearSourceCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("portable raster sources", () => {
  it("rounds fractional sizes and rejects empty/nonfinite surfaces", () => {
    const canvas = createSurface(10.2, 2.1);
    expect([canvas.width, canvas.height]).toEqual([11, 3]);
    for (const [w, h] of [
      [0, 1],
      [1, 0],
      [NaN, 1],
      [1, Infinity],
    ])
      expect(() => createSurface(w!, h!)).toThrow("Dimensions");
  });
  it("fails explicitly without a 2D backend", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    expect(() => context2d(createSurface(2, 2))).toThrow("indisponible");
  });
  it("decodes once and reads original dimensions", async () => {
    const first = loadAsset(asset);
    expect(loadAsset(asset)).toBe(first);
    await first;
    const data = await sourcePixels(asset);
    expect(data.width).toBe(4);
    expect(context.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 4, 3);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 4, 3);
  });
  it("rejects an unreadable asset and permits retries", async () => {
    const broken = { ...asset, dataUrl: "bad" };
    await expect(loadAsset(broken)).rejects.toThrow("photo");
    await expect(loadAsset(broken)).rejects.toThrow("photo");
  });
  it("bounds the decoded asset cache", async () => {
    const first = loadAsset(asset);
    await first;
    for (let i = 0; i < 65; i++) await loadAsset({ ...asset, id: String(i), dataUrl: `data:${i}` });
    expect(loadAsset(asset)).not.toBe(first);
  });
  it.each(["left", "center", "right"] as const)(
    "lays out %s text with wrapping and newlines",
    async (textAlign) => {
      const layer = createLayer("text", {
        width: 84,
        text: "one two three\nnext",
        fontSize: 20,
        fontFamily: 'Inter"',
        textAlign,
        lineHeight: 1.5,
        letterSpacing: 2,
      });
      drawText(context as unknown as CanvasRenderingContext2D, layer);
      const x = textAlign === "left" ? 0 : textAlign === "center" ? 42 : 84;
      expect(context.fillText).toHaveBeenCalledWith("one two", x, 0);
      expect(context.fillText).toHaveBeenCalledWith("three", x, 30);
      expect(context.fillText).toHaveBeenCalledWith("next", x, 60);
      expect(context.font).toContain('"Inter"');
      expect(context.letterSpacing).toBe("2px");
    },
  );
});
