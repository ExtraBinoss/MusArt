import type { Asset, Composition } from "@musart/core";
import { disposeExportRenderers, snapshotComposition } from "../export/standalone";
import { clearSourceCache } from "../surface/sources";
import { assertRenderSize, type RenderOptions } from "./types";
export type { RenderOptions } from "./types";
/** Export/thumbnail compatibility port. The preview uses GpuCompositor directly. */
export async function renderComposition(
  page: Composition,
  assets: Record<string, Asset>,
  options: RenderOptions = {},
): Promise<HTMLCanvasElement> {
  assertRenderSize(page, options.scale ?? 1);
  return snapshotComposition(page, assets, options);
}
export async function clearRenderCaches(): Promise<void> {
  await disposeExportRenderers();
  clearSourceCache();
}
