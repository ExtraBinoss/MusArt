import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinearFilter, NoColorSpace } from "three/webgpu";
import { createGlyphAtlas } from "../../../src/effects/ascii/atlas";
import { installCanvasMock } from "../../canvas-fixture";
let context: ReturnType<typeof installCanvasMock>;
beforeEach(() => {
  context = installCanvasMock();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("immutable ASCII glyph upload", () => {
  it("rasterizes a deterministic 16-cell monochrome atlas once per creation", () => {
    const atlas = createGlyphAtlas();
    expect(atlas.image.width).toBe(256);
    expect(atlas.image.height).toBe(16);
    expect(atlas.isCanvasTexture).toBe(true);
    expect(atlas.colorSpace).toBe(NoColorSpace);
    expect(atlas.minFilter).toBe(LinearFilter);
    expect(atlas.magFilter).toBe(LinearFilter);
    expect(atlas.generateMipmaps).toBe(false);
    expect(context.fillText).toHaveBeenCalledTimes(16);
    expect(context.fillText).toHaveBeenLastCalledWith("#", 248, 8);
    atlas.dispose();
  });
  it("reports missing glyph raster capability explicitly", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    expect(createGlyphAtlas).toThrow("ASCII");
  });
});
