import type { Layer } from "@musart/core";
import { invertMatrix, layerTransform } from "@musart/core";
import {
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector4,
  type RenderTarget,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import { uniform } from "three/tsl";
import {
  blendControls,
  blendNode,
  copyControls,
  copyNode,
  maskControls,
  maskNode,
} from "./nodes/composite";
import { textureFlip } from "./nodes/uv";
import { parseColor } from "./nodes/color";
import { shapeControls, shapeNode, updateShape } from "../surface/shapes";
import type { FrameTexture } from "./types";

function material() {
  return new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    side: DoubleSide,
    toneMapped: false,
  });
}
export class GpuPasses {
  passes = 0;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly mesh = new Mesh(this.geometry, material());
  private readonly clearColor = uniform(new Vector4(0, 0, 0, 0));
  private readonly clearMaterial = material();
  private readonly copy = copyControls();
  private readonly copyMaterial = material();
  private readonly mask = maskControls();
  private readonly maskMaterial = material();
  private readonly blend = blendControls();
  private readonly blendMaterial = material();
  private readonly shape = shapeControls();
  private readonly shapeMaterial = material();
  constructor(private readonly renderer: WebGPURenderer) {
    this.scene.add(this.mesh);
    this.mesh.material.dispose();
    this.clearMaterial.fragmentNode = this.clearColor;
    this.copyMaterial.fragmentNode = copyNode(this.copy);
    this.maskMaterial.fragmentNode = maskNode(this.mask);
    this.blendMaterial.fragmentNode = blendNode(this.blend);
    this.shapeMaterial.fragmentNode = shapeNode(this.shape);
  }
  private draw(material: MeshBasicNodeMaterial, target: RenderTarget | null): void {
    const before = this.renderer.getRenderTarget();
    const auto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.mesh.material = material;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
      this.passes++;
    } finally {
      this.renderer.setRenderTarget(before);
      this.renderer.autoClear = auto;
    }
  }
  clear(target: RenderTarget, color = "transparent"): void {
    const rgba = parseColor(color);
    rgba.x *= rgba.w;
    rgba.y *= rgba.w;
    rgba.z *= rgba.w;
    this.clearColor.value.copy(rgba);
    this.draw(this.clearMaterial, target);
  }
  copyTo(source: FrameTexture, target: RenderTarget | null, normalize = false): void {
    this.copy.source.value = source.texture;
    this.copy.flipY.value = textureFlip(source.texture);
    this.copy.normalize.value = normalize ? 1 : 0;
    this.draw(this.copyMaterial, target);
  }
  maskTo(source: FrameTexture, mask: Texture, inverted: boolean, target: RenderTarget): void {
    this.mask.source.value = source.texture;
    this.mask.flipY.value = textureFlip(source.texture);
    this.mask.maskFlipY.value = textureFlip(mask);
    this.mask.mask.value = mask;
    this.mask.inverted.value = inverted ? 1 : 0;
    this.mask.premultiplied.value = source.premultiplied ? 1 : 0;
    this.draw(this.maskMaterial, target);
  }
  shapeTo(layer: Layer, scale: number, target: RenderTarget): void {
    updateShape(this.shape, layer, scale);
    this.draw(this.shapeMaterial, target);
  }
  blendTo(
    backdrop: Texture,
    source: FrameTexture,
    layer: Layer,
    parentWidth: number,
    parentHeight: number,
    target: RenderTarget,
  ): void {
    this.blend.backdrop.value = backdrop;
    this.blend.backdropFlipY.value = textureFlip(backdrop);
    this.blend.flipY.value = textureFlip(source.texture);
    this.blend.source.value = source.texture;
    this.blend.opacity.value = layer.opacity;
    this.blend.premultiplied.value = source.premultiplied ? 1 : 0;
    this.blend.mode.value =
      layer.blendMode === "multiply" ? 1 : layer.blendMode === "screen" ? 2 : 3;
    this.blend.parentSize.value.set(parentWidth, parentHeight);
    this.blend.sourceSize.value.set(layer.width, layer.height);
    const m = invertMatrix(layerTransform(layer));
    this.blend.inverse.value.set(m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1);
    this.draw(this.blendMaterial, target);
  }
  dispose(): void {
    this.geometry.dispose();
    for (const mat of [
      this.clearMaterial,
      this.copyMaterial,
      this.maskMaterial,
      this.blendMaterial,
      this.shapeMaterial,
    ])
      mat.dispose();
    this.scene.clear();
  }
}
