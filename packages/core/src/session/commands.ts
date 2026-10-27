import { ensure } from "../errors";
import { createLayer, createPage } from "../document/factories";
import {
  getAncestors,
  getDescendants,
  getWorldMatrix,
  IDENTITY,
  invertMatrix,
  multiplyMatrices,
} from "../layers/geometry";
import type { Command, Composition, Layer, Project } from "../document/model";

export interface CommandResult {
  pageId: string;
  selection?: string[];
}
export function currentPage(project: Project, pageId: string): Composition {
  const page = project.pages.find((item) => item.id === pageId);
  ensure(page, "NOT_FOUND", "Composition introuvable");
  return page;
}
function findLayer(page: Composition, id: string): Layer {
  const layer = page.layers.find((item) => item.id === id);
  ensure(layer, "NOT_FOUND", `Calque introuvable : ${id}`);
  return layer;
}
function editable(page: Composition, layer: Layer, allowOwnLock = false): void {
  ensure(
    (allowOwnLock || !layer.locked) &&
      !getAncestors(page, layer.id).some((parent) => parent.locked),
    "LOCKED",
    "Ce calque ou son groupe est verrouillé",
  );
}
function roots(page: Composition, ids: string[]): Layer[] {
  const selected = new Set(ids);
  return [...new Set(ids)]
    .map((id) => findLayer(page, id))
    .filter((layer) => !getAncestors(page, layer.id).some((parent) => selected.has(parent.id)));
}
function deleteLayers(page: Composition, ids: string[]): void {
  const targets = getDescendants(page, ids);
  for (const id of ids) editable(page, findLayer(page, id));
  for (const layer of targets) editable(page, layer);
  const remove = new Set(targets.map((layer) => layer.id));
  page.layers = page.layers.filter((layer) => !remove.has(layer.id));
}
function groupLayers(page: Composition, ids: string[], nextId: (prefix: string) => string): string {
  const selected = roots(page, ids);
  ensure(selected.length > 0, "INVALID_COMMAND", "Sélectionnez des calques à grouper");
  const parentId = selected[0]?.parentId ?? null;
  ensure(
    selected.every((layer) => layer.parentId === parentId),
    "INVALID_HIERARCHY",
    "Les calques doivent partager le même parent",
  );
  for (const layer of selected) editable(page, layer);
  // A full-parent surface preserves rotated children without scaling their content.
  const parent = parentId ? findLayer(page, parentId) : page;
  const group = createLayer("group", {
    id: nextId("group"),
    parentId,
    x: 0,
    y: 0,
    width: parent.width,
    height: parent.height,
    name: "Groupe",
    fill: "transparent",
  });
  const indices = selected.map((layer) => page.layers.indexOf(layer));
  page.layers.splice(Math.max(...indices) + 1, 0, group);
  for (const layer of selected) layer.parentId = group.id;
  return group.id;
}
function ungroupLayers(page: Composition, ids: string[]): string[] {
  const selected = roots(page, ids);
  const nextSelection: string[] = [];
  for (const group of selected) {
    ensure(group.kind === "group", "INVALID_COMMAND", "Le calque n’est pas un groupe");
    editable(page, group);
    const radians = (group.rotation * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const cx = group.width / 2;
    const cy = group.height / 2;
    const children = page.layers.filter((layer) => layer.parentId === group.id);
    // Group effects/opacity/masks cannot be flattened losslessly into independent layers.
    ensure(
      group.effects.length === 0 &&
        group.mask === null &&
        group.opacity === 1 &&
        group.blendMode === "normal",
      "INVALID_COMMAND",
      "Retirez les effets, masque et mélange du groupe avant de dégrouper",
    );
    for (const layer of children) {
      editable(page, layer);
      const centerX = layer.x + layer.width / 2 - cx;
      const centerY = layer.y + layer.height / 2 - cy;
      layer.x = group.x + cx + cosine * centerX - sine * centerY - layer.width / 2;
      layer.y = group.y + cy + sine * centerX + cosine * centerY - layer.height / 2;
      layer.rotation += group.rotation;
      layer.visible = layer.visible && group.visible;
      layer.parentId = group.parentId;
      nextSelection.push(layer.id);
    }
    const childIds = new Set(children.map((layer) => layer.id));
    const insertion = page.layers
      .slice(0, page.layers.indexOf(group))
      .filter((layer) => !childIds.has(layer.id)).length;
    page.layers = page.layers.filter((layer) => layer.id !== group.id && !childIds.has(layer.id));
    page.layers.splice(insertion, 0, ...children);
  }
  return nextSelection;
}

/** Mutates only the private transaction draft; validation and commit belong to EditorEngine. */
export function applyCommand(
  project: Project,
  pageId: string,
  command: Command,
  nextId: (prefix: string) => string,
): CommandResult {
  const page = currentPage(project, pageId);
  switch (command.type) {
    case "addLayers": {
      for (const asset of command.assets ?? []) {
        ensure(
          !Object.hasOwn(project.assets, asset.id),
          "INVALID_COMMAND",
          "Ressource déjà présente",
        );
        project.assets[asset.id] = asset;
      }
      page.layers.push(...command.layers);
      for (const layer of command.layers) {
        if (layer.parentId)
          ensure(
            !getAncestors(page, layer.id).some((parent) => parent.locked),
            "LOCKED",
            "Groupe parent verrouillé",
          );
      }
      return { pageId, selection: command.layers.map((layer) => layer.id) };
    }
    case "updateLayers": {
      ensure(
        !("id" in command.patch) && !("kind" in command.patch) && !("parentId" in command.patch),
        "INVALID_COMMAND",
        "Identité et parenté immuables par cette commande",
      );
      const allowOwnLock = Object.keys(command.patch).every(
        (key) => key === "locked" || key === "visible",
      );
      for (const id of command.ids) {
        const layer = findLayer(page, id);
        editable(page, layer, allowOwnLock);
        Object.assign(layer, command.patch);
      }
      return { pageId };
    }
    case "deleteLayers":
      deleteLayers(page, command.ids);
      return { pageId, selection: [] };
    case "duplicateLayers": {
      const selected = roots(page, command.ids);
      for (const layer of selected) editable(page, layer);
      const children = getDescendants(
        page,
        selected.map((layer) => layer.id),
      );
      const ids = new Map(children.map((layer) => [layer.id, nextId("layer")]));
      const rootIds = new Set(selected.map((layer) => layer.id));
      const clones = children.map((layer) => ({
        ...layer,
        id: ids.get(layer.id)!,
        name: `${layer.name} copie`,
        x: layer.x + (rootIds.has(layer.id) ? 24 : 0),
        y: layer.y + (rootIds.has(layer.id) ? 24 : 0),
        parentId: layer.parentId ? (ids.get(layer.parentId) ?? layer.parentId) : null,
        effects: layer.effects.map((effect) => ({ ...effect, id: nextId("effect") })),
      }));
      page.layers.push(...clones);
      return { pageId, selection: selected.map((layer) => ids.get(layer.id)!) };
    }
    case "reorderLayer": {
      const layer = findLayer(page, command.id);
      editable(page, layer);
      ensure(
        Number.isInteger(command.index) && command.index >= 0 && command.index < page.layers.length,
        "INVALID_COMMAND",
        "Position de calque invalide",
      );
      if (command.parentId !== undefined) {
        if (command.parentId !== null) {
          const parent = findLayer(page, command.parentId);
          ensure(parent.kind === "group", "INVALID_HIERARCHY", "Parent non groupé");
          editable(page, parent);
        }
        ensure(
          !getDescendants(page, [layer.id]).some((item) => item.id === command.parentId),
          "INVALID_HIERARCHY",
          "Parenté cyclique",
        );
        const world = getWorldMatrix(page, layer.id);
        const parentWorld =
          command.parentId === null ? IDENTITY : getWorldMatrix(page, command.parentId);
        const local = multiplyMatrices(invertMatrix(parentWorld), world);
        const rotation = Math.atan2(local[1], local[0]);
        const cx = layer.width / 2;
        const cy = layer.height / 2;
        layer.x = local[4] - cx + Math.cos(rotation) * cx - Math.sin(rotation) * cy;
        layer.y = local[5] - cy + Math.sin(rotation) * cx + Math.cos(rotation) * cy;
        layer.rotation = (rotation * 180) / Math.PI;
        layer.parentId = command.parentId;
      }
      page.layers.splice(page.layers.indexOf(layer), 1);
      page.layers.splice(command.index, 0, layer);
      return { pageId };
    }
    case "groupLayers":
      return { pageId, selection: [groupLayers(page, command.ids, nextId)] };
    case "ungroupLayers":
      return { pageId, selection: ungroupLayers(page, command.ids) };
    case "addPage": {
      const next =
        command.page ??
        createPage({ id: nextId("page"), name: `Composition ${project.pages.length + 1}` });
      project.pages.push(next);
      return { pageId: next.id, selection: [] };
    }
    case "updatePage": {
      ensure(
        Object.keys(command.patch).every((key) =>
          ["name", "width", "height", "background"].includes(key),
        ),
        "INVALID_COMMAND",
        "Propriété de composition non modifiable",
      );
      Object.assign(page, command.patch);
      return { pageId };
    }
    case "deletePage": {
      ensure(
        project.pages.length > 1,
        "LAST_PAGE",
        "La dernière composition ne peut pas être supprimée",
      );
      ensure(
        project.pages.some((item) => item.id === command.id),
        "NOT_FOUND",
        "Composition introuvable",
      );
      project.pages = project.pages.filter((item) => item.id !== command.id);
      return { pageId: command.id === pageId ? project.pages[0]!.id : pageId, selection: [] };
    }
    case "renameProject":
      project.name = command.name;
      return { pageId };
    case "addGuide":
      page.guides.push(command.guide);
      return { pageId };
    case "deleteGuide":
      ensure(
        page.guides.some((guide) => guide.id === command.id),
        "NOT_FOUND",
        "Repère introuvable",
      );
      page.guides = page.guides.filter((guide) => guide.id !== command.id);
      return { pageId };
    case "addAssets":
      for (const asset of command.assets) {
        ensure(
          !Object.hasOwn(project.assets, asset.id),
          "INVALID_COMMAND",
          "Ressource déjà présente",
        );
        project.assets[asset.id] = asset;
      }
      return { pageId };
    default:
      ensure(false, "INVALID_COMMAND", "Commande inconnue");
  }
}
