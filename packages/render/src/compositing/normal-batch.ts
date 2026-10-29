import { compileGpuScene } from "./compile";
import { isInstancedPrimitive } from "./primitives/eligibility";
import type { Bounds, Layer } from "@musart/core";
import { sourcePlacement } from "./group-viewport";
import {
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { normalNode, sourceControls, type SourceControls } from "./nodes/composite";
import { textureFlip } from "./nodes/uv";
import type { FrameTexture } from "./types";
interface Item {
  mesh: Mesh<PlaneGeometry, MeshBasicNodeMaterial>;
  controls: SourceControls;
}
/** Normal source-over layers share one GPU render pass and use hardware alpha blending. */
export class NormalBatch {
  passes = 0;
  private readonly compiled = new WeakSet<Item>();
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, 0, 10);
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly items = new Map<string, Item>();
  constructor(private readonly renderer: WebGPURenderer) {
    this.camera.position.z = 1;
  }
  private item(layerId: string): Item {
    let item = this.items.get(layerId);
    if (!item) {
      const controls = sourceControls();
      const material = new MeshBasicNodeMaterial({
        transparent: true,
        premultipliedAlpha: true,
        blending: NormalBlending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        side: DoubleSide,
      });
      material.fragmentNode = normalNode(controls);
      item = { mesh: new Mesh(this.geometry, material), controls };
      this.items.set(layerId, item);
    }
    return item;
  }
  async prepare(
    layers: readonly Layer[],
    target: RenderTarget,
    canContinue?: () => boolean,
  ): Promise<void> {
    for (const layer of layers) {
      if (layer.maskSource || layer.blendMode !== "normal" || isInstancedPrimitive(layer)) continue;
      const item = this.item(layer.id);
      if (this.compiled.has(item)) continue;
      this.scene.clear();
      item.controls.source.value = target.texture;
      this.scene.add(item.mesh);
      await compileGpuScene(this.renderer, this.scene, this.camera, target, canContinue);
      this.compiled.add(item);
    }
    this.scene.clear();
  }
  draw(
    layers: readonly { layer: Layer; source: FrameTexture }[],
    width: number,
    height: number,
    target: RenderTarget,
    origin?: Pick<Bounds, "x" | "y">,
  ): void {
    if (!layers.length) return;
    this.scene.clear();
    this.camera.right = width;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    for (let index = 0; index < layers.length; index++) {
      const { layer, source } = layers[index]!;
      const placed = sourcePlacement(layer, source.bounds, origin);
      const item = this.item(layer.id);
      item.controls.source.value = source.texture;
      item.controls.flipY.value = textureFlip(source.texture);
      item.controls.opacity.value = layer.opacity;
      item.controls.premultiplied.value = source.premultiplied ? 1 : 0;
      item.mesh.position.set(placed.x + placed.width / 2, placed.y + placed.height / 2, 0);
      item.mesh.scale.set(placed.width, -placed.height, 1);
      item.mesh.rotation.z = (placed.rotation * Math.PI) / 180;
      item.mesh.renderOrder = index;
      this.scene.add(item.mesh);
    }
    const before = this.renderer.getRenderTarget();
    const auto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
      this.passes++;
    } finally {
      this.renderer.setRenderTarget(before);
      this.renderer.autoClear = auto;
    }
  }
  /** Cached subtrees still own live items; membership is independent of this frame's draws. */
  retain(ids: { has(id: string): boolean }): void {
    for (const [id, item] of this.items)
      if (!ids.has(id)) {
        this.scene.remove(item.mesh);
        item.mesh.material.dispose();
        this.items.delete(id);
      }
  }
  dispose(): void {
    this.geometry.dispose();
    for (const item of this.items.values()) item.mesh.material.dispose();
    this.items.clear();
    this.scene.clear();
  }
}
