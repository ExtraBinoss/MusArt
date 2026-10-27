import {
  LinearFilter,
  NoColorSpace,
  RenderTarget,
  UnsignedByteType,
  type Texture,
} from "three/webgpu";
import type { GpuResource } from "../cache/GpuResourceCache";
import type { FrameTexture } from "./types";

export class LayerTargets implements GpuResource {
  signature = "";
  output: FrameTexture | null = null;
  private readonly buffers = new Map<string, RenderTarget>();
  private source: Texture | null = null;
  sourceSignature = "";
  sourceBytes = 0;
  projectedBytes(role: string, width: number, height: number): number {
    const target = this.buffers.get(role);
    return this.bytes - (target ? target.width * target.height * 4 : 0) + width * height * 4;
  }
  target(role: string, width: number, height: number): RenderTarget {
    let target = this.buffers.get(role);
    if (!target) {
      target = new RenderTarget(width, height, {
        depthBuffer: false,
        stencilBuffer: false,
        type: UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      });
      target.texture.colorSpace = NoColorSpace;
      target.texture.generateMipmaps = false;
      this.buffers.set(role, target);
    } else target.setSize(width, height);
    return target;
  }
  get sourceTexture(): Texture | null {
    return this.source;
  }
  setSource(texture: Texture, signature: string, bytes: number): void {
    this.source?.dispose();
    this.source = texture;
    this.sourceSignature = signature;
    this.sourceBytes = bytes;
  }
  get bytes(): number {
    return (
      this.sourceBytes +
      [...this.buffers.values()].reduce((sum, target) => sum + target.width * target.height * 4, 0)
    );
  }
  get targets(): number {
    return this.buffers.size;
  }
  dispose(): void {
    this.source?.dispose();
    this.source = null;
    for (const target of this.buffers.values()) target.dispose();
    this.buffers.clear();
    this.output = null;
    this.sourceBytes = 0;
  }
}
