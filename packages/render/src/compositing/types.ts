import type { Texture } from "three/webgpu";
import type { Bounds, Composition } from "@musart/core";
import type { FontResolver } from "../surface/text/fonts";
export interface RenderOptions {
  scale?: number;
  forceWebGL?: boolean;
  canRender?: () => boolean;
  fontResolver?: FontResolver;
}
export interface FrameTexture {
  texture: Texture;
  width: number;
  height: number;
  premultiplied: boolean;
  /** A transport texture may cover only this rectangle of its owner's authored coordinates. */
  bounds?: Bounds;
}
export interface GpuStats {
  passes: number;
  readbacks: number;
  uploads: number;
  targets: number;
  cacheBytes: number;
  frames: number;
  cacheHits: number;
  vectorParses: number;
  maxBytes: number;
  primitiveDraws?: number;
  primitiveInstances?: number;
  primitiveBytes?: number;
}
/** Ceil true fractional coverage without adding a texel for multiplication roundoff. */
export function rasterExtent(extent: number, scale: number): number {
  const value = extent * scale;
  if (!Number.isFinite(value) || extent <= 0 || scale <= 0)
    throw new RangeError("Invalid raster extent.");
  return Math.max(1, Math.ceil(value - Math.max(1, Math.abs(value)) * Number.EPSILON * 4));
}
export function assertRenderSize(page: Composition, scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8)
    throw new Error("Échelle d’export invalide (0–8×).");
  if (
    page.width * scale > 16384 ||
    page.height * scale > 16384 ||
    page.width * page.height * scale * scale > 64_000_000
  )
    throw new Error("Export trop grand : limite de 16 384 px par côté et 64 mégapixels.");
}
