import type { Composition, Layer } from "../document/model";
import { ensure } from "../errors";
import { createLayerGeometryIndex } from "./geometry-index";
import { releaseUnusedMaskSources } from "./access";
import type { CommandHandler } from "../session/context";

/** Validate every target before applying any edit, indexing one command draft once. */
export function applyLayerPatches(
  page: Composition,
  patches: readonly { id: string; patch: Partial<Layer> }[],
): void {
  ensure(
    Array.isArray(patches) && patches.length <= 100000,
    "INVALID_COMMAND",
    "Invalid layer patch batch",
  );
  const geometry = createLayerGeometryIndex(page),
    seen = new Set<string>();
  for (const { id, patch } of patches) {
    ensure(!seen.has(id), "INVALID_COMMAND", "Duplicate layer patch target");
    seen.add(id);
    ensure(
      patch !== null &&
        typeof patch === "object" &&
        !Array.isArray(patch) &&
        !("id" in patch) &&
        !("kind" in patch) &&
        !("parentId" in patch) &&
        !["__proto__", "prototype", "constructor"].some((key) => Object.hasOwn(patch, key)),
      "INVALID_COMMAND",
      "Identité et parenté immuables par cette commande",
    );
    ensure(geometry.byId.has(id), "NOT_FOUND", `Calque introuvable : ${id}`);
    const layer = geometry.get(id);
    const allowOwnLock = Object.keys(patch).every((key) => key === "locked" || key === "visible");
    ensure(
      (allowOwnLock || !layer.locked) && (!layer.parentId || !geometry.isLocked(layer.parentId)),
      "LOCKED",
      "Calque ou groupe parent verrouillé",
    );
  }
  for (const { id, patch } of patches) Object.assign(geometry.get(id), patch);
  if (patches.some(({ patch }) => patch.mask === null)) releaseUnusedMaskSources(page);
}
export const updateLayerPatches: CommandHandler<"updateLayerPatches"> = (
  { page, pageId },
  command,
) => {
  applyLayerPatches(page, command.patches);
  return { pageId };
};
