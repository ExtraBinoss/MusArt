import type { RenderTarget, WebGPURenderer } from "three/webgpu";
import {
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
} from "three/webgpu";
import type { FrameTexture } from "../compositing/types";
import { textureFlip } from "../compositing/nodes/uv";
import { colorControls, colorNode } from "./nodes";
export class ColorPipeline {
  passes = 0;
  private readonly controls = colorControls();
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material = new MeshBasicNodeMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  constructor(private readonly renderer: WebGPURenderer) {
    this.material.fragmentNode = colorNode(this.controls);
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  render(
    source: FrameTexture,
    target: RenderTarget,
    mode: "to-p3" | "to-srgb" | "cmyk-proof",
  ): void {
    this.controls.source.value = source.texture;
    this.controls.flipY.value = textureFlip(source.texture);
    this.controls.premultiplied.value = source.premultiplied ? 1 : 0;
    this.controls.mode.value = mode === "to-p3" ? 1 : mode === "to-srgb" ? 2 : 3;
    const previous = this.renderer.getRenderTarget(),
      auto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
      this.passes++;
    } finally {
      this.renderer.setRenderTarget(previous);
      this.renderer.autoClear = auto;
    }
  }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
