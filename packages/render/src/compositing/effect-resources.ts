import type { Effect } from "@musart/core";
import type { RenderTarget, Texture, WebGPURenderer } from "three/webgpu";
import type { GpuResource } from "../cache/GpuResourceCache";
import { GpuEffects } from "../effects/GpuEffects";

/** Registers the shared operator's scratch/atlas in the same hard GPU allocation budget. */
export class EffectResources implements GpuResource {
  private readonly operator: GpuEffects;
  private scratchBytes = 0;
  private atlasBytes = 0;
  constructor(renderer: WebGPURenderer) {
    this.operator = new GpuEffects(renderer);
  }
  projectedBytes(width: number, height: number, effects: readonly Effect[]): number {
    const enabled = effects.filter((effect) => effect.enabled);
    return (
      (enabled.length > 1 ? width * height * 4 : this.scratchBytes) +
      (this.atlasBytes || (enabled.some((effect) => effect.type === "ascii") ? 256 * 16 * 4 : 0))
    );
  }
  apply(
    source: Texture,
    width: number,
    height: number,
    effects: readonly Effect[],
    output: RenderTarget,
  ): Texture {
    if (effects.filter((effect) => effect.enabled).length > 1)
      this.scratchBytes = width * height * 4;
    try {
      return this.operator.apply(source, width, height, effects, output);
    } finally {
      this.atlasBytes = this.operator.stats().bytes - this.scratchBytes;
    }
  }
  get bytes(): number {
    return this.operator.stats().bytes;
  }
  get targets(): number {
    return this.operator.stats().targets;
  }
  stats() {
    return this.operator.stats();
  }
  dispose(): void {
    this.operator.dispose();
    this.scratchBytes = 0;
    this.atlasBytes = 0;
  }
}
