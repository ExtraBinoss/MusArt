import type { Effect, EffectType } from "@musart/core";
import {
  Mesh,
  MeshBasicNodeMaterial,
  NearestFilter,
  NoBlending,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  UnsignedByteType,
  type CanvasTexture,
  type Texture,
  type TextureNode,
  type WebGPURenderer,
} from "three/webgpu";
import { texture } from "three/tsl";
import { createGlyphAtlas } from "./ascii/atlas";
import { EFFECT_NODES } from "./registry";
import { createEffectUniforms, updateEffectUniforms, type EffectUniforms } from "./shared/uniforms";

interface EffectPass {
  readonly material: MeshBasicNodeMaterial;
  readonly source: TextureNode<"vec4">;
  readonly controls: EffectUniforms;
}
export interface GpuEffectStats {
  /** Successful draws since this operator was constructed. */
  readonly passes: number;
  readonly targets: number;
  /** Owned scratch and atlas bytes; caller-owned output textures are excluded. */
  readonly bytes: number;
  readonly materials: number;
}

/** Shared-renderer GPU operator. Intermediate and result pixels remain on the device. */
export class GpuEffects {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly passes = new Map<EffectType, EffectPass>();
  private mesh: Mesh<PlaneGeometry, MeshBasicNodeMaterial> | null = null;
  private atlas: CanvasTexture | null = null;
  private scratch: RenderTarget | null = null;
  private renderedPasses = 0;
  private disposed = false;

  constructor(private readonly renderer: WebGPURenderer) {}

  private getGlyphAtlas = (): Texture => {
    this.atlas ??= createGlyphAtlas();
    return this.atlas;
  };
  private getPass(effect: Effect, input: Texture, width: number, height: number): EffectPass {
    let pass = this.passes.get(effect.type);
    if (!pass) {
      if (!Object.hasOwn(EFFECT_NODES, effect.type))
        throw new Error(`Effet GPU inconnu : ${effect.type}`);
      const builder = EFFECT_NODES[effect.type];
      const source = texture(input);
      const controls = createEffectUniforms(effect, width, height);
      const node = builder({ source, controls, getGlyphAtlas: this.getGlyphAtlas });
      const material = new MeshBasicNodeMaterial({
        depthTest: false,
        depthWrite: false,
        blending: NoBlending,
        toneMapped: false,
      });
      material.fragmentNode = node;
      pass = { material, source, controls };
      this.passes.set(effect.type, pass);
    }
    pass.source.value = input;
    pass.controls.sourceFlipY.value = input.isRenderTargetTexture ? 1 : 0;
    updateEffectUniforms(pass.controls, effect, width, height);
    return pass;
  }
  private getScratch(width: number, height: number): RenderTarget {
    if (!this.scratch) {
      this.scratch = new RenderTarget(width, height, {
        depthBuffer: false,
        type: UnsignedByteType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
      });
      this.scratch.texture.colorSpace = NoColorSpace;
    }
    this.scratch.setSize(width, height);
    return this.scratch;
  }

  /**
   * Output belongs to the caller and remains valid after other layers are processed.
   * The returned texture is source when every effect is disabled, otherwise output.texture.
   * Source must differ from output.texture to prevent a GPU feedback loop.
   */
  apply(
    source: Texture,
    width: number,
    height: number,
    effects: readonly Effect[],
    output: RenderTarget,
  ): Texture {
    if (this.disposed) throw new Error("L’opérateur d’effets a été fermé.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
      throw new Error("Dimensions GPU invalides.");
    const enabled = effects.filter((effect) => effect.enabled);
    if (!enabled.length) return source;
    if (source === output.texture)
      throw new Error("La source et la cible GPU doivent être distinctes.");
    output.setSize(width, height);
    const scratch = enabled.length > 1 ? this.getScratch(width, height) : null;
    const previous = this.renderer.getRenderTarget();
    let input = source;
    try {
      for (const [index, effect] of enabled.entries()) {
        const pass = this.getPass(effect, input, width, height);
        if (!this.mesh) {
          this.mesh = new Mesh(this.geometry, pass.material);
          this.scene.add(this.mesh);
        } else this.mesh.material = pass.material;
        // Parity selects the first target so the last pass always lands in durable output.
        const target = (enabled.length - index) % 2 === 1 ? output : scratch!;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
        this.renderedPasses++;
        input = target.texture;
      }
      return output.texture;
    } finally {
      this.renderer.setRenderTarget(previous);
    }
  }

  stats(): GpuEffectStats {
    return {
      passes: this.renderedPasses,
      targets: this.scratch ? 1 : 0,
      bytes:
        (this.scratch ? this.scratch.width * this.scratch.height * 4 : 0) +
        (this.atlas ? 256 * 16 * 4 : 0),
      materials: this.passes.size,
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scratch?.dispose();
    this.scratch = null;
    this.atlas?.dispose();
    this.atlas = null;
    for (const pass of this.passes.values()) pass.material.dispose();
    this.passes.clear();
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
    this.geometry.dispose();
  }
}
