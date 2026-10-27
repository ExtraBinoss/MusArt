import type { Effect } from "@musart/core";
import type { RenderTarget, Texture, WebGPURenderer } from "three/webgpu";
import type { GpuResource } from "../cache/GpuResourceCache";
import { GpuEffects } from "../effects/GpuEffects";

/** Registers the shared operator's scratch/atlas in the same hard GPU allocation budget. */
export class EffectResources implements GpuResource {
  private readonly operator: GpuEffects;
  constructor(renderer: WebGPURenderer) {
    this.operator = new GpuEffects(renderer);
  }
  projectedBytes(width: number, height: number, effects: readonly Effect[]): number {
    return this.operator.projectedBytes(width, height, effects);
  }
  apply(
    source: Texture,
    width: number,
    height: number,
    effects: readonly Effect[],
    output: RenderTarget,
  ): Texture {
    return this.operator.apply(source, width, height, effects, output);
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
  }
}
