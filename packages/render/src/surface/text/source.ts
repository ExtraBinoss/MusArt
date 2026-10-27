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
import { layoutText } from "./layout";
import { glyphGeometry } from "./geometry";
import { glyphCoverage, glyphPosition } from "./coverage";
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

  constructor(layer: Layer, font: OutlineFont) {
    let atlas: CurveAtlas | undefined,
      geometry: InstancedBufferGeometry | undefined,
      material: MeshBasicNodeMaterial | undefined;
    try {
      const layout = layoutText(layer, font);
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
      material.positionNode = glyphPosition();
      const paint = textPaintNode(this.paint),
        coverage = glyphCoverage(atlas.texture, atlas.width);
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
  async prepare(page: Composition): Promise<void> {
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
        if (!layer.visible || layer.opacity === 0) continue;
        if (layer.kind === "group") parents.push(layer.id);
        if (layer.kind !== "text") continue;
        this.assertOpen();
        const key = `text:${textGeometryKey(layer)}`;
        if (this.cache.get<TextResource>(key)) continue;
        let job = this.pending.get(key);
        if (!job) {
          job = this.prepareLayer(layer, key).finally(() => {
            if (this.pending.get(key) === job) this.pending.delete(key);
          });
          this.pending.set(key, job);
        }
        await job;
      }
    }
    this.assertOpen();
  }
  private async prepareLayer(layer: Layer, key: string): Promise<void> {
    const lease = await this.fonts.acquire(layer.fontFamily, layer.fontWeight);
    try {
      this.assertOpen();
      const resource = new TextResource(layer, lease.font);
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
    const resource = this.cache.get<TextResource>(`text:${textGeometryKey(layer)}`);
    if (!resource) throw new Error("Text outline source was not prepared.");
    updateTextPaint(resource.paint, layer);
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
