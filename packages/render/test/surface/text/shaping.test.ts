import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { parse } from "opentype.js";
import { installCanvasMock } from "../../canvas-fixture";
import { outlineFont } from "../../text-fixture";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("harfbuzzjs/hb.js");
  vi.doUnmock("harfbuzzjs/hbjs.js");
});
async function mockNative() {
  vi.resetModules();
  const blob = { destroy: vi.fn() },
    face = { destroy: vi.fn() },
    font = { destroy: vi.fn(), setVariations: vi.fn() };
  const buffer = {
    destroy: vi.fn(),
    addText: vi.fn(),
    guessSegmentProperties: vi.fn(),
    json: vi.fn(() => [{ g: 1, ax: 500, dx: 2, dy: 3, cl: 0 }]),
  };
  const api = {
    createBlob: vi.fn(() => blob),
    createFace: vi.fn(() => face),
    createFont: vi.fn(() => font),
    createBuffer: vi.fn(() => buffer),
    shape: vi.fn(),
  };
  const moduleFactory = vi.fn(async () => ({}));
  vi.doMock("harfbuzzjs/hb.js", () => ({ default: moduleFactory }));
  vi.doMock("harfbuzzjs/hbjs.js", () => ({ default: () => api }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(4))),
  );
  const { createShaper: create } = await import("../../../src/surface/text/shaping");
  const getGlyph = vi.fn(() => outlineFont().charToGlyph("A"));
  return {
    blob,
    face,
    font,
    buffer,
    api,
    moduleFactory,
    getGlyph,
    create: () => create(new ArrayBuffer(4), getGlyph),
  };
}
it.each(["blob", "face", "font"] as const)(
  "releases native predecessors after %s allocation fails",
  async (stage) => {
    const native = await mockNative(),
      error = new Error(`${stage} failed`);
    const allocators = {
      blob: native.api.createBlob,
      face: native.api.createFace,
      font: native.api.createFont,
    };
    allocators[stage].mockImplementationOnce(() => {
      throw error;
    });
    await expect(native.create()).rejects.toBe(error);
    expect(native.blob.destroy).toHaveBeenCalledTimes(stage === "blob" ? 0 : 1);
    expect(native.face.destroy).toHaveBeenCalledTimes(stage === "font" ? 1 : 0);
    expect(native.font.destroy).not.toHaveBeenCalled();
  },
);
it("preserves initialization errors and attempts remaining native frees after a destructor fails", async () => {
  const native = await mockNative(),
    initial = new Error("font allocation failed"),
    cleanup = new Error("face free failed");
  native.api.createFont.mockImplementationOnce(() => {
    throw initial;
  });
  native.face.destroy.mockImplementationOnce(() => {
    throw cleanup;
  });
  const error = await native.create().catch((value: unknown) => value);
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toEqual([initial, cleanup]);
  expect(native.blob.destroy).toHaveBeenCalledOnce();
});
it.each(["addText", "guessSegmentProperties", "shape", "json", "glyph"] as const)(
  "always destroys a shaping buffer after %s fails",
  async (stage) => {
    const native = await mockNative(),
      shaper = await native.create(),
      error = new Error("shape failed");
    const operations = {
      addText: native.buffer.addText,
      guessSegmentProperties: native.buffer.guessSegmentProperties,
      shape: native.api.shape,
      json: native.buffer.json,
      glyph: native.getGlyph,
    };
    operations[stage].mockImplementationOnce(() => {
      throw error;
    });
    expect(() => shaper.shape("Cafe\u0301", 700)).toThrow(error);
    expect(native.buffer.destroy).toHaveBeenCalledOnce();
    shaper.dispose();
    for (const value of [native.font, native.face, native.blob])
      expect(value.destroy).toHaveBeenCalledOnce();
  },
);
it.each(["variations", "buffer"] as const)(
  "keeps the face owned when %s setup fails before a buffer exists",
  async (stage) => {
    const native = await mockNative(),
      shaper = await native.create();
    const operation = stage === "variations" ? native.font.setVariations : native.api.createBuffer;
    operation.mockImplementationOnce(() => {
      throw new Error("setup failed");
    });
    expect(() => shaper.shape("A", 400)).toThrow("setup failed");
    expect(native.buffer.destroy).not.toHaveBeenCalled();
    shaper.dispose();
    expect(native.font.destroy).toHaveBeenCalledOnce();
  },
);
it("reports both shape and buffer-free errors without forgetting the remaining owned resources", async () => {
  const native = await mockNative(),
    shaper = await native.create(),
    initial = new Error("shape failed"),
    cleanup = new Error("buffer free failed");
  native.api.shape.mockImplementationOnce(() => {
    throw initial;
  });
  native.buffer.destroy.mockImplementationOnce(() => {
    throw cleanup;
  });
  let caught: unknown;
  try {
    shaper.shape("A", 400);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AggregateError);
  expect((caught as AggregateError).errors).toEqual([initial, cleanup]);
  shaper.dispose();
  expect(native.font.destroy).toHaveBeenCalledOnce();
});
it("attempts every destructor once and rejects further shaping even after cleanup errors", async () => {
  const native = await mockNative(),
    shaper = await native.create();
  native.font.destroy.mockImplementationOnce(() => {
    throw new Error("font free failed");
  });
  native.face.destroy.mockImplementationOnce(() => {
    throw new Error("face free failed");
  });
  expect(() => shaper.dispose()).toThrow(AggregateError);
  expect(native.blob.destroy).toHaveBeenCalledOnce();
  expect(() => shaper.dispose()).not.toThrow();
  expect(native.font.destroy).toHaveBeenCalledOnce();
  expect(() => shaper.shape("A", 400)).toThrow("disposed");
});
it("retries a failed runtime initialization and destroys successful shape buffers once", async () => {
  const native = await mockNative();
  native.moduleFactory.mockRejectedValueOnce(new Error("module failed"));
  await expect(native.create()).rejects.toThrow("module failed");
  const shaper = await native.create();
  const result = shaper.shape("Cafe\u0301", 500);
  expect(result).toMatchObject([{ advance: 500, dx: 2, dy: 3, cluster: 0 }]);
  expect(native.buffer.addText).toHaveBeenCalledWith("Café");
  expect(native.font.setVariations).toHaveBeenCalledWith({ wght: 500, opsz: 14 });
  expect(native.buffer.destroy).toHaveBeenCalledOnce();
  expect(native.moduleFactory).toHaveBeenCalledTimes(2);
  shaper.dispose();
});
it("shapes real Inter ligatures, kerning, accents and variations with explicit resource disposal", async () => {
  vi.resetModules();
  installCanvasMock();
  const { createShaper } = await import("../../../src/surface/text/shaping");
  const bytes = await readFile("apps/web/public/fonts/inter/font.ttf"),
    buffer = new Uint8Array(bytes).buffer,
    font = parse(buffer);
  const shaper = await createShaper(buffer, (index) => font.glyphs.get(index));
  const combined = shaper.shape("AV", 400),
    separate = [...shaper.shape("A", 400), ...shaper.shape("V", 400)];
  expect(combined.reduce((sum, item) => sum + item.advance, 0)).toBeLessThan(
    separate.reduce((sum, item) => sum + item.advance, 0),
  );
  expect(shaper.shape("Café", 400).map((item) => item.glyph.index)).toEqual(
    shaper.shape("Cafe\u0301", 400).map((item) => item.glyph.index),
  );
  expect(shaper.shape("office", 400).every((item) => item.glyph.index > 0)).toBe(true);
  expect(shaper.shape("AV", 900).map((item) => item.advance)).not.toEqual(
    combined.map((item) => item.advance),
  );
  expect(shaper.shape("", 400)).toEqual([]);
  shaper.dispose();
  shaper.dispose();
  expect(() => shaper.shape("A", 400)).toThrow("disposed");
});
it("reports unavailable local shaping runtime instead of pretending text rendered", async () => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
  const { createShaper: create } = await import("../../../src/surface/text/shaping");
  await expect(
    create(new ArrayBuffer(4), () => {
      throw new Error("unreachable");
    }),
  ).rejects.toThrow("shaping runtime");
});
