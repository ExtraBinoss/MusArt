import { afterEach, describe, expect, it, vi } from "vitest";
import { createPage } from "@musart/core";
import { exportComposition } from "../../src/export/export";
const render = vi.hoisted(() => vi.fn());
vi.mock("../../src/compositing/compositor", () => ({ renderComposition: render }));
afterEach(() => {
  vi.restoreAllMocks();
  render.mockReset();
});
describe("high quality image encoding", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "exports %s at committed document scale and quality",
    async (format) => {
      const canvas = document.createElement("canvas");
      render.mockResolvedValue(canvas);
      vi.spyOn(canvas, "toBlob").mockImplementation((callback, mime) =>
        callback(new Blob(["pixels"], { type: mime })),
      );
      const page = createPage();
      const options = { scale: 2, format, quality: 0.9 };
      const result = await exportComposition(page, {}, options);
      expect(result.type).toBe(`image/${format}`);
      expect(render).toHaveBeenCalledWith(page, {}, options);
      expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), `image/${format}`, 0.9);
    },
  );
  it("uses lossless PNG by default and exposes encoding errors", async () => {
    const canvas = document.createElement("canvas");
    render.mockResolvedValue(canvas);
    const encode = vi
      .spyOn(canvas, "toBlob")
      .mockImplementation((callback) => callback(new Blob([""], { type: "image/png" })));
    expect((await exportComposition(createPage(), {})).type).toBe("image/png");
    encode.mockImplementation((callback) => callback(null));
    await expect(exportComposition(createPage(), {})).rejects.toThrow("encodage");
    encode.mockImplementation((callback) => callback(new Blob([""], { type: "image/png" })));
    await expect(exportComposition(createPage(), {}, { format: "webp" })).rejects.toThrow("WEBP");
  });
  it("rejects nonfinite or out-of-range quality rather than silently changing it", async () => {
    render.mockResolvedValue(document.createElement("canvas"));
    for (const quality of [NaN, -1, 2])
      await expect(exportComposition(createPage(), {}, { quality })).rejects.toThrow("Qualité");
  });
});
