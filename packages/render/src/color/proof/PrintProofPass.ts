import {
  ClampToEdgeWrapping,
  Data3DTexture,
  LinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Texture,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { clamp, Fn, mix, texture, texture3D, uniform, vec3, vec4 } from "three/tsl";
import type { GpuResource } from "../../cache/GpuResourceCache";
import type { FrameTexture } from "../../compositing/types";
import { compileGpuScene } from "../../compositing/compile";
import { textureFlip, textureUv } from "../../compositing/nodes/uv";
import { loadPrintProof, PRINT_PROOF_BYTES, PRINT_PROOF_SIZE } from "./table";

/** ICC sRGB → CMYK8 → sRGB proof, sampled on GPU after composition, over white paper. */
export class PrintProofPass implements GpuResource {
  readonly bytes = PRINT_PROOF_BYTES;
  readonly targets = 0;
  private readonly lut = new Data3DTexture();
  private readonly placeholder = new Texture();
  private readonly source = texture(this.placeholder);
  private readonly flipY = uniform(0);
  private readonly premultiplied = uniform(0);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material = new MeshBasicNodeMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private prepared = false;
  private disposed = false;

  constructor(private readonly renderer: WebGPURenderer) {
    this.lut.colorSpace = NoColorSpace;
    this.lut.minFilter = this.lut.magFilter = LinearFilter;
    this.lut.wrapS = this.lut.wrapT = this.lut.wrapR = ClampToEdgeWrapping;
    this.lut.generateMipmaps = false;
    this.material.fragmentNode = Fn(() => {
      const sample = this.source.sample(textureUv(this.flipY));
      // Frame textures are premultiplied; flatten onto paper before the nonlinear ICC mapping.
      const paper = mix(sample.rgb.mul(sample.a), sample.rgb, this.premultiplied).add(
        sample.a.oneMinus(),
      );
      const coordinates = clamp(paper, 0, 1)
        .mul(1 - 1 / PRINT_PROOF_SIZE)
        .add(vec3(0.5 / PRINT_PROOF_SIZE));
      return vec4(texture3D(this.lut, coordinates).rgb, 1);
    })();
    this.scene.add(new Mesh(this.geometry, this.material));
  }

  async prepare(target: RenderTarget, canContinue?: () => boolean): Promise<void> {
    if (this.prepared) return;
    const data = await loadPrintProof();
    if (this.disposed || (canContinue && !canContinue()))
      throw new DOMException("Print proof was superseded.", "AbortError");
    this.lut.image = {
      data,
      width: PRINT_PROOF_SIZE,
      height: PRINT_PROOF_SIZE,
      depth: PRINT_PROOF_SIZE,
    };
    this.lut.needsUpdate = true;
    this.source.value = target.texture;
    await compileGpuScene(this.renderer, this.scene, this.camera, target, canContinue);
    this.prepared = true;
  }

  render(source: FrameTexture, target: RenderTarget): void {
    if (!this.prepared || this.disposed) throw new Error("Print proof is not ready.");
    this.source.value = source.texture;
    this.flipY.value = textureFlip(source.texture);
    this.premultiplied.value = source.premultiplied ? 1 : 0;
    const previous = this.renderer.getRenderTarget(),
      auto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(previous);
      this.renderer.autoClear = auto;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lut.dispose();
    this.placeholder.dispose();
    this.material.dispose();
    this.geometry.dispose();
    this.scene.clear();
  }
}
