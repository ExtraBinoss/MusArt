import { compileGpuScene } from "./compile";
import type { Bounds, Layer } from "@musart/core";
import { sourcePlacement } from "./group-viewport";
import { invertMatrix, layerTransform } from "@musart/core";
import {
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  Vector4,
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
import { blendModeId } from "./blends/registry";
import { textureFlip } from "./nodes/uv";
import { parseColor } from "./nodes/color";
import { shapeControls, shapeNode, updateShape } from "../surface/shapes";
import type { MaskMapping } from "./mask-binding";
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
  private readonly compiled = new WeakSet<MeshBasicNodeMaterial>();
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
  async prepare(target: RenderTarget, canContinue?: () => boolean): Promise<void> {
    const materials = [
      this.clearMaterial,
      this.copyMaterial,
      this.maskMaterial,
      this.blendMaterial,
      this.shapeMaterial,
    ];
    if (materials.every((material) => this.compiled.has(material))) return;
    const previous = this.mesh.material;
    const bindings = [
      this.copy.source,
      this.mask.source,
      this.mask.mask,
      this.blend.source,
      this.blend.backdrop,
    ];
    const textures = bindings.map((binding) => binding.value);
    // Three deduplicates sampler uniforms by the texture UUID at compilation.
    // Each logical input must have a distinct, valid texture before the shader
    // is built; later changing .value cannot separate an already shared binding.
    const inputs = Array.from(
      { length: 3 },
      () =>
        new RenderTarget(1, 1, {
          type: target.texture.type,
          format: target.texture.format,
          colorSpace: target.texture.colorSpace,
          minFilter: target.texture.minFilter,
          magFilter: target.texture.magFilter,
          generateMipmaps: target.texture.generateMipmaps,
          depthBuffer: false,
          stencilBuffer: false,
        }),
    );
    this.copy.source.value = this.mask.source.value = this.blend.source.value = inputs[0]!.texture;
    this.blend.backdrop.value = inputs[1]!.texture;
    this.mask.mask.value = inputs[2]!.texture;
    try {
      for (const material of materials) {
        if (this.compiled.has(material)) continue;
        this.mesh.material = material;
        await compileGpuScene(this.renderer, this.scene, this.camera, target, canContinue);
        this.compiled.add(material);
      }
    } finally {
      this.mesh.material = previous;
      bindings.forEach((binding, index) => {
        binding.value = textures[index]!;
      });
      for (const input of inputs) {
        // Compilation can initialize a sampled texture without initializing its
        // framebuffer. Dispose both explicitly; all three inputs are owned here.
        input.texture.dispose();
        input.dispose();
      }
    }
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
  copyTo(
    source: FrameTexture,
    target: RenderTarget | null,
    normalize = false,
    premultiply = false,
  ): void {
    this.copy.source.value = source.texture;
    this.copy.flipY.value = textureFlip(source.texture);
    this.copy.normalize.value = normalize ? 1 : 0;
    this.copy.premultiply.value = premultiply ? 1 : 0;
    this.draw(this.copyMaterial, target);
  }
  maskTo(
    source: FrameTexture,
    mask: Texture,
    inverted: boolean,
    target: RenderTarget,
    mapping?: Partial<MaskMapping>,
  ): void {
    this.mask.source.value = source.texture;
    this.mask.flipY.value = textureFlip(source.texture);
    this.mask.maskFlipY.value = textureFlip(mask);
    this.mask.mask.value = mask;
    this.mask.inverted.value = inverted ? 1 : 0;
    this.mask.premultiplied.value = source.premultiplied ? 1 : 0;
    this.mask.maskPremultiplied.value = mapping?.premultiplied ? 1 : 0;
    this.mask.maskOpacity.value = mapping?.opacity ?? 1;
    this.mask.luminance.value = mapping?.luminance ? 1 : 0;
    this.mask.transformed.value = mapping?.transformed ? 1 : 0;
    this.mask.targetSize.value.set(mapping?.targetWidth ?? 1, mapping?.targetHeight ?? 1);
    this.mask.sourceSize.value.set(mapping?.sourceWidth ?? 1, mapping?.sourceHeight ?? 1);
    const matrix = mapping?.matrix ?? [1, 0, 0, 1, 0, 0];
    this.mask.inverse.value.set(
      matrix[0]!,
      matrix[2]!,
      matrix[4]!,
      matrix[1]!,
      matrix[3]!,
      matrix[5]!,
      0,
      0,
      1,
    );
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
    origin?: Pick<Bounds, "x" | "y">,
  ): void {
    const placed = sourcePlacement(layer, source.bounds, origin);
    this.blend.backdrop.value = backdrop;
    this.blend.backdropFlipY.value = textureFlip(backdrop);
    this.blend.flipY.value = textureFlip(source.texture);
    this.blend.source.value = source.texture;
    this.blend.opacity.value = layer.opacity;
    this.blend.premultiplied.value = source.premultiplied ? 1 : 0;
    this.blend.mode.value = blendModeId(layer.blendMode);
    this.blend.parentSize.value.set(parentWidth, parentHeight);
    this.blend.sourceSize.value.set(placed.width, placed.height);
    const m = invertMatrix(layerTransform(placed));
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
