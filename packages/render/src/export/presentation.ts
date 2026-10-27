import {
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
  type WebGPURenderer,
} from "three/webgpu";
import { texture, uv } from "three/tsl";
import type { FrameTexture } from "../compositing/types";
/** The final image remains a texture until browser-owned bitmap/PNG encoding. */
export class GpuPresentation {
  private readonly source = texture(new Texture());
  private readonly material = new MeshBasicNodeMaterial({
    blending: NoBlending,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  constructor(private readonly renderer: WebGPURenderer) {
    this.material.fragmentNode = this.source.sample(uv().flipY());
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  render(frame: FrameTexture): void {
    this.source.value = frame.texture;
    this.renderer.setSize(frame.width, frame.height, false);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
