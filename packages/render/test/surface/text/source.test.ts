import { afterEach, expect, it, vi } from "vitest";
import { createLayer, createPage } from "@musart/core";
import {
  CustomBlending,
  MaxEquation,
  MeshBasicNodeMaterial,
  OneFactor,
  RenderTarget,
} from "three/webgpu";
import { GpuResourceCache } from "../../../src/cache/GpuResourceCache";
import { TextResource, TextSources, textGeometryKey } from "../../../src/surface/text/source";
import { FontRepository, type FontLease } from "../../../src/surface/text/fonts";
import * as atlasModule from "../../../src/surface/text/atlas";
import * as geometryModule from "../../../src/surface/text/geometry";
import * as paintModule from "../../../src/surface/text/paint";
import { outlineFont } from "../../text-fixture";
import { makeGpuRenderer } from "../../gpu-fixture";
import { installCanvasMock } from "../../canvas-fixture";
const lease = (font = outlineFont()): FontLease => ({ font, release: vi.fn() });
afterEach(() => vi.restoreAllMocks());
it("reuses curve geometry and resources during paint/gradient/position edits, and restores renderer state on errors", async () => {
  const face = lease();
  vi.spyOn(FontRepository.prototype, "acquire").mockResolvedValue(face);
  const { renderer, fake } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new TextSources(renderer, cache),
    layer = createLayer("text", { text: "AV", width: 200, height: 100 }),
    page = createPage({ layers: [layer] }),
    target = new RenderTarget(200, 100);
  await sources.prepare(page);
  await sources.prepare(page);
  expect(sources.parses).toBe(1);
  expect(face.release).toHaveBeenCalledOnce();
  sources.render({ ...layer, fill: "#ff0000", x: 30 }, target);
  expect(fake.getRenderTarget()).toBe(null);
  expect(fake.autoClear).toBe(true);
  expect(textGeometryKey({ ...layer, fill: "#00ff00" })).toBe(textGeometryKey(layer));
  const resource = cache.get<TextResource>(`text:${textGeometryKey(layer)}`)!;
  expect(resource.paint.solid.value.x).toBe(1);
  expect(resource.material).toMatchObject({
    blending: CustomBlending,
    blendEquation: MaxEquation,
    blendEquationAlpha: MaxEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
    premultipliedAlpha: true,
  });
  expect(resource.bytes).toBeGreaterThan(0);
  fake.render.mockImplementationOnce(() => {
    throw new Error("GPU lost");
  });
  expect(() => sources.render(layer, target)).toThrow("GPU lost");
  expect(fake.getRenderTarget()).toBe(null);
  expect(fake.autoClear).toBe(true);
  await sources.prepare(
    createPage({
      layers: [{ ...layer, visible: false }, createLayer("rectangle"), { ...layer, opacity: 0 }],
    }),
  );
  expect(sources.parses).toBe(1);
  expect(() => sources.render({ ...layer, text: "new" }, target)).toThrow("not prepared");
  const dispose = vi.spyOn(resource.atlas.texture, "dispose");
  cache.clear();
  resource.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  sources.dispose();
  target.dispose();
});

it("prepares a shared geometry once across concurrent callers and retries failed preparation", async () => {
  let resolve!: (font: FontLease) => void;
  const font = outlineFont(),
    loading = new Promise<FontLease>((done) => {
      resolve = done;
    }),
    load = vi
      .spyOn(FontRepository.prototype, "acquire")
      .mockReturnValueOnce(loading)
      .mockResolvedValue(lease(font)),
    { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new TextSources(renderer, cache),
    layer = createLayer("text", { text: "AV" }),
    page = createPage({ layers: [layer] });
  const first = sources.prepare(page),
    second = sources.prepare(page);
  expect(load).toHaveBeenCalledOnce();
  resolve(lease(font));
  await Promise.all([first, second]);
  expect(sources.parses).toBe(1);
  cache.clear();
  load.mockRejectedValueOnce(new Error("Font temporarily unavailable"));
  await expect(sources.prepare(page)).rejects.toThrow("temporarily unavailable");
  await sources.prepare(page);
  expect(sources.parses).toBe(2);
  cache.clear();
  sources.dispose();
});

it("rejects an asynchronous font result after disposal without admitting a text resource", async () => {
  let resolve!: (font: FontLease) => void;
  vi.spyOn(FontRepository.prototype, "acquire").mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const clear = vi.spyOn(FontRepository.prototype, "clear"),
    { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new TextSources(renderer, cache),
    layer = createLayer("text", { text: "AV" }),
    pending = sources.prepare(createPage({ layers: [layer] })),
    rejection = expect(pending).rejects.toThrow("disposed"),
    target = new RenderTarget(10, 10);
  sources.dispose();
  sources.dispose();
  const face = lease();
  resolve(face);
  await rejection;
  expect(cache.stats().entries).toBe(0);
  expect(sources.parses).toBe(0);
  expect(clear).toHaveBeenCalledOnce();
  expect(face.release).toHaveBeenCalledOnce();
  await expect(sources.prepare(createPage())).rejects.toThrow("disposed");
  expect(() => sources.render(layer, target)).toThrow("disposed");
  target.dispose();
});

it("skips text inside hidden or transparent ancestor branches", async () => {
  const load = vi.spyOn(FontRepository.prototype, "acquire").mockResolvedValue(lease()),
    { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new TextSources(renderer, cache),
    hidden = createLayer("group", { visible: false }),
    transparent = createLayer("group", { opacity: 0 }),
    visible = createLayer("group"),
    hiddenText = createLayer("text", { text: "hidden", parentId: hidden.id }),
    transparentText = createLayer("text", { text: "transparent", parentId: transparent.id }),
    visibleText = createLayer("text", { text: "A", parentId: visible.id });
  await sources.prepare(
    createPage({
      layers: [hidden, hiddenText, transparent, transparentText, visible, visibleText],
    }),
  );
  expect(load).toHaveBeenCalledOnce();
  expect(sources.parses).toBe(1);
  expect(cache.get(`text:${textGeometryKey(hiddenText)}`)).toBeUndefined();
  expect(cache.get(`text:${textGeometryKey(transparentText)}`)).toBeUndefined();
  expect(cache.get(`text:${textGeometryKey(visibleText)}`)).toBeDefined();
  cache.clear();
  sources.dispose();
});
it.each(["geometry", "budget"])(
  "releases the font lease after %s preparation fails",
  async (failure) => {
    const face = lease();
    vi.spyOn(FontRepository.prototype, "acquire").mockResolvedValue(face);
    const { renderer } = makeGpuRenderer(),
      cache = new GpuResourceCache(failure === "budget" ? 1 : undefined),
      sources = new TextSources(renderer, cache);
    if (failure === "geometry")
      vi.spyOn(geometryModule, "glyphGeometry").mockImplementationOnce(() => {
        throw new Error("Geometry failed");
      });
    await expect(
      sources.prepare(createPage({ layers: [createLayer("text", { text: "A" })] })),
    ).rejects.toThrow();
    expect(face.release).toHaveBeenCalledOnce();
    expect(cache.stats().entries).toBe(0);
    sources.dispose();
    cache.clear();
  },
);
it("uses injected custom/remote font binaries without geometry identity collisions", async () => {
  installCanvasMock();
  const bytes = outlineFont().toArrayBuffer(),
    resolver = vi.fn(async () => bytes.slice(0));
  const { renderer } = makeGpuRenderer(),
    cache = new GpuResourceCache(),
    sources = new TextSources(renderer, cache, { fontResolver: resolver });
  const first = createLayer("text", { text: "A", fontFamily: "custom:abcdef" }),
    second = createLayer("text", { text: "A", fontFamily: "Remote Family" });
  expect(textGeometryKey(first)).not.toBe(textGeometryKey(second));
  expect(textGeometryKey({ ...second, fontFamily: "  remote   family  " })).toBe(
    textGeometryKey(second),
  );
  await sources.prepare(createPage({ layers: [first, second] }));
  expect(resolver).toHaveBeenCalledWith("custom:abcdef", first.fontWeight, expect.any(AbortSignal));
  expect(resolver).toHaveBeenCalledWith(
    "Remote Family",
    second.fontWeight,
    expect.any(AbortSignal),
  );
  expect(sources.parses).toBe(2);
  cache.clear();
  sources.dispose();
});

it("disposes an atlas if geometry creation fails before cache ownership", () => {
  const font = outlineFont(),
    atlas = atlasModule.buildCurveAtlas([font.charToGlyph("A")], font.unitsPerEm),
    dispose = vi.spyOn(atlas.texture, "dispose");
  vi.spyOn(atlasModule, "buildCurveAtlas").mockReturnValue(atlas);
  vi.spyOn(geometryModule, "glyphGeometry").mockImplementationOnce(() => {
    throw new Error("Geometry failed");
  });
  expect(() => new TextResource(createLayer("text", { text: "A" }), font)).toThrow(
    "Geometry failed",
  );
  expect(dispose).toHaveBeenCalledOnce();
});

it("disposes material, geometry and atlas after a paint-node construction failure", () => {
  const font = outlineFont(),
    layer = createLayer("text", { text: "A" }),
    atlas = atlasModule.buildCurveAtlas([font.charToGlyph("A")], font.unitsPerEm),
    geometry = geometryModule.glyphGeometry(
      layer,
      [{ glyph: font.charToGlyph("A"), x: 0, baseline: 80 }],
      atlas,
      font.unitsPerEm,
    ),
    atlasDispose = vi.spyOn(atlas.texture, "dispose"),
    geometryDispose = vi.spyOn(geometry, "dispose"),
    materialDispose = vi.spyOn(MeshBasicNodeMaterial.prototype, "dispose");
  vi.spyOn(atlasModule, "buildCurveAtlas").mockReturnValue(atlas);
  vi.spyOn(geometryModule, "glyphGeometry").mockReturnValue(geometry);
  vi.spyOn(paintModule, "textPaintNode").mockImplementationOnce(() => {
    throw new Error("Paint failed");
  });
  expect(() => new TextResource(layer, font)).toThrow("Paint failed");
  expect(atlasDispose).toHaveBeenCalledOnce();
  expect(geometryDispose).toHaveBeenCalledOnce();
  expect(materialDispose).toHaveBeenCalledOnce();
});
