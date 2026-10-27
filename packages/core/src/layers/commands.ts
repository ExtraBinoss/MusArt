import { ensure } from "../errors";
import {
  getAncestors,
  getDescendants,
  getWorldMatrix,
  IDENTITY,
  invertMatrix,
  multiplyMatrices,
} from "./geometry";
import {
  getLayer,
  assertEditable,
  selectedRoots,
  deleteLayerTree,
  releaseUnusedMaskSources,
} from "./access";
import { groupLayers, ungroupLayers } from "./grouping";
import type { CommandHandler } from "../session/context";
export const addLayers: CommandHandler<"addLayers"> = ({ project, page, pageId }, command) => {
  for (const asset of command.assets ?? []) {
    ensure(!Object.hasOwn(project.assets, asset.id), "INVALID_COMMAND", "Ressource déjà présente");
    project.assets[asset.id] = asset;
  }
  page.layers.push(...command.layers);
  for (const layer of command.layers)
    if (layer.parentId)
      ensure(
        !getAncestors(page, layer.id).some((parent) => parent.locked),
        "LOCKED",
        "Groupe parent verrouillé",
      );
  return { pageId, selection: command.layers.map((layer) => layer.id) };
};
export const updateLayers: CommandHandler<"updateLayers"> = ({ page, pageId }, command) => {
  ensure(
    !("id" in command.patch) && !("kind" in command.patch) && !("parentId" in command.patch),
    "INVALID_COMMAND",
    "Identité et parenté immuables par cette commande",
  );
  const allowOwnLock = Object.keys(command.patch).every(
    (key) => key === "locked" || key === "visible",
  );
  for (const id of command.ids) {
    const layer = getLayer(page, id);
    assertEditable(page, layer, allowOwnLock);
    Object.assign(layer, command.patch);
  }
  if (command.patch.mask === null) releaseUnusedMaskSources(page);
  return { pageId };
};
export const deleteLayers: CommandHandler<"deleteLayers"> = ({ page, pageId }, command) => {
  deleteLayerTree(page, command.ids);
  return { pageId, selection: [] };
};
export const duplicateLayers: CommandHandler<"duplicateLayers"> = (
  { page, pageId, nextId },
  command,
) => {
  const roots = selectedRoots(page, command.ids);
  for (const layer of roots) assertEditable(page, layer);
  const children = getDescendants(
    page,
    roots.map((layer) => layer.id),
  );
  const ids = new Map(children.map((layer) => [layer.id, nextId("layer")]));
  const rootIds = new Set(roots.map((layer) => layer.id));
  const clones = children.map((layer) => ({
    ...layer,
    id: ids.get(layer.id)!,
    name: `${layer.name} copie`,
    x: layer.x + (rootIds.has(layer.id) ? 24 : 0),
    y: layer.y + (rootIds.has(layer.id) ? 24 : 0),
    parentId: layer.parentId ? (ids.get(layer.parentId) ?? layer.parentId) : null,
    effects: layer.effects.map((effect) => ({ ...effect, id: nextId("effect") })),
    ...(layer.guides
      ? { guides: layer.guides.map((guide) => ({ ...guide, id: nextId("guide") })) }
      : {}),
    ...(layer.mask?.layerId
      ? { mask: { ...layer.mask, layerId: ids.get(layer.mask.layerId) ?? layer.mask.layerId } }
      : {}),
  }));
  page.layers.push(...clones);
  return { pageId, selection: roots.map((layer) => ids.get(layer.id)!) };
};
export const reorderLayer: CommandHandler<"reorderLayer"> = ({ page, pageId }, command) => {
  const layer = getLayer(page, command.id);
  assertEditable(page, layer);
  ensure(
    Number.isInteger(command.index) && command.index >= 0 && command.index < page.layers.length,
    "INVALID_COMMAND",
    "Position de calque invalide",
  );
  if (command.parentId !== undefined) {
    if (command.parentId !== null) {
      const parent = getLayer(page, command.parentId);
      ensure(parent.kind === "group", "INVALID_HIERARCHY", "Parent non groupé");
      assertEditable(page, parent);
    }
    ensure(
      !getDescendants(page, [layer.id]).some((item) => item.id === command.parentId),
      "INVALID_HIERARCHY",
      "Parenté cyclique",
    );
    const world = getWorldMatrix(page, layer.id),
      parentWorld = command.parentId === null ? IDENTITY : getWorldMatrix(page, command.parentId);
    const local = multiplyMatrices(invertMatrix(parentWorld), world),
      rotation = Math.atan2(local[1], local[0]),
      cx = layer.width / 2,
      cy = layer.height / 2;
    layer.x = local[4] - cx + Math.cos(rotation) * cx - Math.sin(rotation) * cy;
    layer.y = local[5] - cy + Math.sin(rotation) * cx + Math.cos(rotation) * cy;
    layer.rotation = (rotation * 180) / Math.PI;
    layer.parentId = command.parentId;
  }
  page.layers.splice(page.layers.indexOf(layer), 1);
  page.layers.splice(command.index, 0, layer);
  return { pageId };
};
export const createGroup: CommandHandler<"groupLayers"> = ({ page, pageId, nextId }, command) => ({
  pageId,
  selection: [groupLayers(page, command.ids, nextId)],
});
export const removeGroup: CommandHandler<"ungroupLayers"> = ({ page, pageId }, command) => ({
  pageId,
  selection: ungroupLayers(page, command.ids),
});
