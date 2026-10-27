import type { Layer } from "@musart/core";
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
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, 0, 10);
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly items = new Map<string, Item>();
  constructor(private readonly renderer: WebGPURenderer) {
    this.camera.position.z = 1;
  }
  draw(
    layers: readonly { layer: Layer; source: FrameTexture }[],
    width: number,
    height: number,
    target: RenderTarget,
  ): void {
    if (!layers.length) return;
    this.scene.clear();
    this.camera.right = width;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    for (let index = 0; index < layers.length; index++) {
      const { layer, source } = layers[index]!;
      let item = this.items.get(layer.id);
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
        this.items.set(layer.id, item);
      }
      item.controls.source.value = source.texture;
      item.controls.flipY.value = textureFlip(source.texture);
      item.controls.opacity.value = layer.opacity;
      item.controls.premultiplied.value = source.premultiplied ? 1 : 0;
      item.mesh.position.set(layer.x + layer.width / 2, layer.y + layer.height / 2, 0);
      item.mesh.scale.set(layer.width, -layer.height, 1);
      item.mesh.rotation.z = (layer.rotation * Math.PI) / 180;
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
  retain(ids: Set<string>): void {
    for (const [id, item] of this.items)
      if (!ids.has(id)) {
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
