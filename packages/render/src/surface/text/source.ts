import { MorphResource, morphResourceKey, sourceMorph } from "../morph/resource";
import { buildMorphAtlasAsync } from "../morph/atlas";
import { textMorph } from "../morph/text";
import { compileGpuScene } from "../../compositing/compile";
import type { Composition, Layer } from "@musart/core";
import {
  DoubleSide,
  CustomBlending,
  MaxEquation,
  Mesh,
  MeshBasicNodeMaterial,
  OneFactor,
  OrthographicCamera,
  Scene,
  type InstancedBufferGeometry,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { vec4 } from "three/tsl";
import { GpuResourceCache, type GpuResource } from "../../cache/GpuResourceCache";
import { FontRepository, normalizeFontFamily, type FontResolver, type OutlineFont } from "./fonts";
import { buildCurveAtlas, type CurveAtlas } from "./atlas";
import { layoutText, type PlacedGlyph } from "./layout";
import { glyphGeometry, updateGlyphGeometry } from "./geometry";
import { glyphCoverage } from "./coverage";
import { glyphVertex } from "./vertex";
import { textPaint, textPaintNode, updateTextPaint } from "./paint";

export function textGeometryKey(layer: Layer): string {
  return JSON.stringify([
    normalizeFontFamily(layer.fontFamily),
    layer.fontWeight,
    layer.fontSize,
    layer.text,
    layer.width,
    layer.height,
    layer.lineHeight,
    layer.letterSpacing,
    layer.textAlign,
  ]);
}

/** Per-layer outline identity excludes continuous layout; document edits still invalidate pixels. */
export function textResourceKey(layer: Layer): string {
  const morph = sourceMorph(layer);
  if (morph) return `morph:${morphResourceKey(layer, morph)}`;
  return JSON.stringify([
    layer.id,
    normalizeFontFamily(layer.fontFamily),
    layer.fontWeight,
    layer.text,
  ]);
}

export class TextResource implements GpuResource {
  readonly targets = 0;
  readonly scene = new Scene();
  readonly paint = textPaint();
  readonly camera: OrthographicCamera;
  readonly atlas: CurveAtlas;
  readonly geometry: InstancedBufferGeometry;
  readonly material: MeshBasicNodeMaterial;
  readonly bytes: number;
  private closed = false;
  private compiled = false;
  private layoutKey: string;
  private readonly glyphIds: readonly number[];

  constructor(layer: Layer, font: OutlineFont, layout: PlacedGlyph[] = layoutText(layer, font)) {
    this.layoutKey = textGeometryKey(layer);
    this.glyphIds = layout.map((item) => item.glyph.index);
    let atlas: CurveAtlas | undefined,
      geometry: InstancedBufferGeometry | undefined,
      material: MeshBasicNodeMaterial | undefined;
    try {
      atlas = buildCurveAtlas(
        layout.map(({ glyph }) => glyph),
        font.unitsPerEm,
      );
      geometry = glyphGeometry(layer, layout, atlas, font.unitsPerEm);
      material = new MeshBasicNodeMaterial({
        transparent: true,
        premultipliedAlpha: true,
        blending: CustomBlending,
        blendEquation: MaxEquation,
        blendEquationAlpha: MaxEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      });
      this.camera = new OrthographicCamera(0, layer.width, 0, layer.height, 0, 100);
      this.camera.position.z = 10;
      const vertex = glyphVertex();
      material.positionNode = vertex.position;
      const paint = textPaintNode(this.paint, vertex.pixel),
        coverage = glyphCoverage(atlas.texture, atlas.width, vertex.coordinate);
      material.fragmentNode = vec4(paint.rgb, paint.a.mul(coverage));
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.atlas = atlas;
      this.geometry = geometry;
      this.material = material;
      this.bytes =
        atlas.bytes +
        Object.values(geometry.attributes).reduce(
          (sum, attribute) => sum + attribute.array.byteLength,
          0,
        ) +
        (geometry.index?.array.byteLength ?? 0);
    } catch (error) {
      this.scene.clear();
      material?.dispose();
      geometry?.dispose();
      atlas?.texture.dispose();
      throw error;
    }
  }
  matchesLayout(layer: Layer): boolean {
    return this.layoutKey === textGeometryKey(layer);
  }
  canUpdateLayout(layout: PlacedGlyph[]): boolean {
    return (
      layout.length === this.glyphIds.length &&
      layout.every((item, index) => item.glyph.index === this.glyphIds[index])
    );
  }
  updateLayout(layer: Layer, layout: PlacedGlyph[], unitsPerEm: number): void {
    if (!this.canUpdateLayout(layout)) throw new Error("Text layout changed its glyph topology.");
    updateGlyphGeometry(this.geometry, layer, layout, this.atlas, unitsPerEm);
    this.camera.right = layer.width;
    this.camera.bottom = layer.height;
    this.camera.updateProjectionMatrix();
    this.layoutKey = textGeometryKey(layer);
  }
  async prepare(
    renderer: WebGPURenderer,
    target: RenderTarget,
    canContinue?: () => boolean,
  ): Promise<void> {
    if (this.compiled) return;
    await compileGpuScene(renderer, this.scene, this.camera, target, canContinue);
    this.compiled = true;
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.scene.clear();
    this.material.dispose();
    this.geometry.dispose();
    this.atlas.texture.dispose();
  }
}

/** Font parsing/layout are cached preparation; paint and analytical glyph coverage run in TSL. */
export class TextSources {
  parses = 0;
  passes = 0;
  private readonly fonts: FontRepository;
  private readonly pending = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
    options: { fontResolver?: FontResolver } = {},
  ) {
    this.fonts = new FontRepository({ resolver: options.fontResolver });
  }
  async prepare(
    page: Composition,
    options: { target?: RenderTarget; canContinue?: () => boolean } = {},
  ): Promise<void> {
    this.assertOpen();
    const byParent = new Map<string | null, Layer[]>();
    for (const layer of page.layers) {
      const siblings = byParent.get(layer.parentId) ?? [];
      siblings.push(layer);
      byParent.set(layer.parentId, siblings);
    }
    const parents: (string | null)[] = [null];
    while (parents.length) {
      for (const layer of byParent.get(parents.pop()!) ?? []) {
        if (!layer.visible || (layer.opacity === 0 && page.motion?.mode !== "motion")) continue;
        if (layer.kind === "group") parents.push(layer.id);
        if (layer.kind !== "text") continue;
        this.assertOpen();
        const key = `text:${textResourceKey(layer)}`;
        let resource = this.cache.get<TextResource | MorphResource>(key);
        if (resource?.matchesLayout(layer)) {
          if (options.target)
            await resource.prepare(this.renderer, options.target, options.canContinue);
          continue;
        }
        let job = this.pending.get(key);
        if (!job) {
          job = this.prepareLayer(layer, key, options.canContinue).finally(() => {
            if (this.pending.get(key) === job) this.pending.delete(key);
          });
          this.pending.set(key, job);
        }
        await job;
        resource = this.cache.get<TextResource | MorphResource>(key);
        if (options.target && resource)
          await resource.prepare(this.renderer, options.target, options.canContinue);
      }
    }
    this.assertOpen();
  }
  private async prepareLayer(
    layer: Layer,
    key: string,
    canContinue?: () => boolean,
  ): Promise<void> {
    const lease = await this.fonts.acquire(layer.fontFamily, layer.fontWeight);
    try {
      this.assertOpen();
      const layout = layoutText(layer, lease.font);
      const existing = this.cache.get<TextResource | MorphResource>(key);
      if (existing instanceof TextResource && existing.canUpdateLayout(layout)) {
        existing.updateLayout(layer, layout, lease.font.unitsPerEm);
        return;
      }
      const effect = sourceMorph(layer);
      let resource: TextResource | MorphResource;
      if (effect) {
        const definition = textMorph(layer, effect, lease.font, layout);
        const atlas = await buildMorphAtlasAsync(definition, {
          canContinue: () => !this.disposed && (canContinue?.() ?? true),
        });
        try {
          this.assertOpen();
          resource = new MorphResource(layer, effect, definition, atlas);
        } catch (error) {
          atlas.texture.dispose();
          throw error;
        }
      } else resource = new TextResource(layer, lease.font, layout);
      if (this.disposed) {
        resource.dispose();
        this.assertOpen();
      }
      // The GPU resource contains copied curves and no longer depends on its font face.
      this.cache.set(key, resource);
      this.parses++;
    } finally {
      lease.release();
    }
  }
  private assertOpen(): void {
    if (this.disposed) throw new Error("Text source is disposed.");
  }
  render(layer: Layer, target: RenderTarget): void {
    this.assertOpen();
    const resource = this.cache.get<TextResource | MorphResource>(`text:${textResourceKey(layer)}`);
    if (!resource?.matchesLayout(layer)) throw new Error("Text outline source was not prepared.");
    updateTextPaint(resource.paint, layer);
    if (resource instanceof MorphResource) resource.update(layer, sourceMorph(layer)!);
    const previous = this.renderer.getRenderTarget(),
      auto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      this.renderer.render(resource.scene, resource.camera);
      this.passes++;
    } finally {
      this.renderer.setRenderTarget(previous);
      this.renderer.autoClear = auto;
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.clear();
    this.fonts.clear();
  }
}
