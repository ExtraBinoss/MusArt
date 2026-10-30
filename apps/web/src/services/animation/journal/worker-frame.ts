import { projectFromReplayState, validateProject, type Asset, type Project } from "@musart/core";
import type { IDBPDatabase } from "idb";
import type { StudioDatabase } from "../../projects/database";
import type { JournalFrame } from "./model";
/** The worker owns its metadata mirror; direct fallback receives the same isolation. */
export function snapshotJournalFrame(frame: JournalFrame): JournalFrame {
  // Validate the exact detached values. A fallback caller's getters must not
  // substitute different metadata between validation and capture.
  const snapshot = structuredClone(frame);
  frame = snapshot;
  if (
    !frame ||
    !frame.state ||
    !Array.isArray(frame.state.pages) ||
    !Array.isArray(frame.state.assetIds) ||
    !Array.isArray(frame.assets) ||
    !Array.isArray(frame.descriptions) ||
    !Number.isSafeInteger(frame.revision) ||
    frame.revision < 0 ||
    !frame.state.pages.some((page) => page.id === frame.pageId) ||
    Object.hasOwn(frame.state, "assets") ||
    Object.hasOwn(frame.state, "replay")
  )
    throw Error("Invalid journal frame.");
  const ids = new Set(frame.state.assetIds);
  if (
    ids.size !== frame.state.assetIds.length ||
    frame.descriptions.length !== ids.size ||
    frame.descriptions.some(
      (description) => !ids.has(description.id) || Object.hasOwn(description, "dataUrl"),
    ) ||
    new Set(frame.descriptions.map((description) => description.id)).size !== ids.size ||
    frame.assets.some((asset) => !ids.has(asset.id)) ||
    new Set(frame.assets.map((asset) => asset.id)).size !== frame.assets.length
  )
    throw Error("Invalid journal original metadata.");
  const pending: unknown[] = [snapshot];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || Object.isFrozen(value)) continue;
    pending.push(...Object.values(value));
    Object.freeze(value);
  }
  return snapshot;
}
/** Resolve genuine bytes lazily; no placeholder can make an initialization succeed. */
export async function projectForJournal(
  db: IDBPDatabase<StudioDatabase>,
  frame: JournalFrame,
): Promise<Project> {
  const incoming = new Map(frame.assets.map((asset) => [asset.id, asset])),
    descriptions = new Map(frame.descriptions.map((asset) => [asset.id, asset])),
    pool: Record<string, Asset> = {};
  const tx = db.transaction(["journalAssets", "assets", "mediaOriginalMeta"], "readonly");
  for (const id of frame.state.assetIds) {
    const asset =
      incoming.get(id) ?? (await tx.objectStore("journalAssets").get([frame.state.id, id]))?.asset;
    const description = descriptions.get(id)!;
    if (description.kind === "video" || description.kind === "audio") {
      const header = await tx
        .objectStore("mediaOriginalMeta")
        .get([frame.state.id, description.originalId]);
      if (
        !header ||
        header.contentRevision !== description.contentRevision ||
        header.byteLength !== description.byteLength
      )
        throw Error(`Journal ${description.kind} original is missing: ${id}`);
      Object.defineProperty(pool, id, { value: description, enumerable: true });
      continue;
    }
    const dataUrl =
      asset?.dataUrl ?? (await tx.objectStore("assets").get([frame.state.id, id]))?.dataUrl;
    if (!dataUrl) throw Error(`Journal original is missing: ${id}`);
    Object.defineProperty(pool, id, {
      value: { ...descriptions.get(id)!, dataUrl },
      enumerable: true,
    });
  }
  await tx.done;
  const project = projectFromReplayState(frame.state, pool);
  validateProject(project);
  return project;
}
