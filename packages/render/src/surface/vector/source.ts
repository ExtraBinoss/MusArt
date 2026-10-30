import { MorphResource, morphResourceKey, sourceMorph } from "../morph/resource";
import type { Layer, VectorPart } from "@musart/core";
import {
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  NormalBlending,
  OrthographicCamera,
  Scene,
  Vector4,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { mix, uniform, vec4 } from "three/tsl";
import { srgbToDisplayP3 } from "../../color/nodes";
import { GpuResourceCache, type GpuResource } from "../../cache/GpuResourceCache";
import { parseColor } from "../../compositing/nodes/color";
import {
  parseVectorGeometry,
  vectorGeometryKey,
  vectorParts,
  type VectorGeometryPart,
} from "./geometry";
function partPaint(layer: Layer, part: VectorPart, kind: "fill" | "stroke"): Vector4 {
  let paint = layer.fill;
  if (layer.vector?.preserveColors)
    paint = part[kind] ?? (kind === "fill" ? "#000000" : "currentColor");
  else if (kind === "stroke" && !layer.vector?.strokeOnly && layer.strokeWidth > 0)
    paint = layer.stroke;
  if (paint === "currentColor") paint = layer.fill;
  if (paint === "none") paint = "transparent";
  const rgba = parseColor(paint);
  rgba.w *= part.opacity ?? 1;
  return rgba;
}
const createPaint = () => uniform(new Vector4());
class VectorResource implements GpuResource {
  readonly targets = 0;
  readonly scene = new Scene();
  readonly importedP3 = uniform(0);
  readonly camera: OrthographicCamera;
  readonly items: {
    part: VectorGeometryPart;
    mesh: Mesh;
    paint: ReturnType<typeof createPaint>;
  }[] = [];
  constructor(layer: Layer) {
    const box = layer
      .vector!.viewBox.trim()
      .split(/[\s,]+/)
      .map(Number);
    this.camera = new OrthographicCamera(
      box[0]!,
      box[0]! + box[2]!,
      box[1]!,
      box[1]! + box[3]!,
      0,
      100,
    );
    this.camera.position.z = 10;
    const geometry = parseVectorGeometry(layer);
    try {
      for (const part of geometry) {
        const paint = uniform(partPaint(layer, part.part, part.kind));
        const material = new MeshBasicNodeMaterial({
          transparent: true,
          premultipliedAlpha: true,
          blending: NormalBlending,
          depthTest: false,
          depthWrite: false,
          side: DoubleSide,
          toneMapped: false,
        });
        material.fragmentNode = vec4(
          mix(paint.rgb, srgbToDisplayP3(paint.rgb), this.importedP3),
          paint.a,
        );
        const mesh = new Mesh(part.geometry, material);
        mesh.renderOrder = this.items.length;
        this.scene.add(mesh);
        this.items.push({ part, mesh, paint });
      }
    } catch (error) {
      for (const part of geometry) part.geometry.dispose();
      this.dispose();
      throw error;
    }
  }
  paint(layer: Layer, displayP3: boolean): void {
    this.importedP3.value = displayP3 && layer.vector?.preserveColors ? 1 : 0;
    for (const item of this.items)
      item.paint.value.copy(
        partPaint(layer, vectorParts(layer.vector!)[item.part.partIndex]!, item.part.kind),
      );
  }
  get bytes(): number {
    return this.items.reduce(
      (total, item) =>
        total +
        Object.values(item.part.geometry.attributes).reduce(
          (bytes, attribute) => bytes + attribute.array.byteLength,
          0,
        ) +
        (item.part.geometry.index?.array.byteLength ?? 0),
      0,
    );
  }
  dispose(): void {
    for (const item of this.items) {
      item.part.geometry.dispose();
      const materials = Array.isArray(item.mesh.material)
        ? item.mesh.material
        : [item.mesh.material];
      for (const mat of materials) mat.dispose();
    }
    this.items.length = 0;
    this.scene.clear();
  }
}
/** Path parsing and triangulation happen once; live fill uses only stable material uniforms. */
export class VectorSources {
  parses = 0;
  passes = 0;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
  ) {}
  render(layer: Layer, target: RenderTarget, displayP3 = false): void {
    const morph = sourceMorph(layer);
    if (morph) {
      if (!morph.shapeMorph) throw Error("Vector morph requires authored contour states");
      const key = `morph:${morphResourceKey(layer, morph)}`;
      let resource = this.cache.get<MorphResource>(key);
      if (!resource) {
        resource = new MorphResource(layer, morph, morph.shapeMorph);
        this.cache.set(key, resource);
        this.parses++;
      }
      resource.update(layer, morph);
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
      return;
    }
    const key = `vector:${vectorGeometryKey(layer)}`;
    let resource = this.cache.get<VectorResource>(key);
    if (!resource) {
      resource = new VectorResource(layer);
      this.cache.set(key, resource);
      this.parses++;
    }
    resource.paint(layer, displayP3);
    const previous = this.renderer.getRenderTarget();
    const auto = this.renderer.autoClear;
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
}
