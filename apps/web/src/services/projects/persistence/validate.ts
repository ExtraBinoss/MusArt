import { validateAssetDescription } from "@musart/core";
import type { ProjectWriteFrame } from "./model";
import { THUMBNAIL_RENDER_VERSION } from "../thumbnails/model";
/** Transport metadata is private, but incomplete/corrupt frames must fail before acquiring write locks. */
export function validateProjectWrite(frame: ProjectWriteFrame): void {
  if (
    !frame ||
    typeof frame !== "object" ||
    !frame.document ||
    typeof frame.document.id !== "string" ||
    !frame.document.id ||
    Object.hasOwn(frame.document, "assets") ||
    !Array.isArray(frame.document.pages) ||
    !frame.document.pages.length ||
    !Array.isArray(frame.descriptions) ||
    frame.descriptions.length > 5000 ||
    !Array.isArray(frame.originals) ||
    typeof frame.expectedRevision !== "string" ||
    typeof frame.requireAbsent !== "boolean" ||
    typeof frame.remember !== "boolean" ||
    frame.thumbnailRenderVersion !== THUMBNAIL_RENDER_VERSION ||
    (frame.basis !== undefined && typeof frame.basis !== "string") ||
    !frame.pageRevisions ||
    typeof frame.pageRevisions !== "object"
  )
    throw Error("Invalid project persistence frame.");
  const ids = new Set<string>();
  for (const asset of frame.descriptions) {
    if (
      !asset ||
      typeof asset.id !== "string" ||
      !asset.id ||
      ids.has(asset.id) ||
      Object.hasOwn(asset, "dataUrl")
    )
      throw Error("Invalid original metadata.");
    if (asset.kind === "video" || asset.kind === "audio")
      validateAssetDescription(asset as unknown as Record<string, unknown>);
    ids.add(asset.id);
  }
  const originals = new Set<string>();
  const imageIds = new Set(
    frame.descriptions
      .filter((asset) => asset.kind !== "video" && asset.kind !== "audio")
      .map((asset) => asset.id),
  );
  for (const asset of frame.originals) {
    if (
      !asset ||
      asset.projectId !== frame.document.id ||
      !imageIds.has(asset.assetId) ||
      originals.has(asset.assetId) ||
      typeof asset.dataUrl !== "string" ||
      !asset.dataUrl.startsWith("data:image/")
    )
      throw Error("Invalid captured original.");
    originals.add(asset.assetId);
  }
  if (frame.basis === undefined && originals.size !== imageIds.size)
    throw Error("Missing captured originals.");
  if (
    frame.document.pages.some(
      (page) =>
        !page ||
        typeof page.id !== "string" ||
        typeof frame.pageRevisions[page.id] !== "string" ||
        !frame.pageRevisions[page.id],
    )
  )
    throw Error("Missing page revision.");
  if (
    frame.pagePayloads &&
    (frame.pagePayloads.length !== frame.document.pages.length ||
      frame.pagePayloads.some((bytes) => !Number.isSafeInteger(bytes) || bytes < 2))
  )
    throw Error("Invalid page accounting.");
}
