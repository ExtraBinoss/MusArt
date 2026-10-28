import {
  createEffect,
  createLayer,
  createLayerGeometryIndex,
  transformPoint,
  type Asset,
  type Command,
  type Composition,
} from "@musart/core";

/** Preserve an existing clip on an editable GPU mask source, without doubling parent opacity. */
export function selectionMaskCommands(
  page: Composition,
  layerId: string,
  asset: Asset,
  erase: boolean,
): Command[] {
  const geometry = createLayerGeometryIndex(page),
    layer = geometry.get(layerId);
  const commands: Command[] = [{ type: "addAssets", assets: [asset] }];
  if (!layer.mask) {
    commands.push({
      type: "updateLayers",
      ids: [layerId],
      patch: {
        mask: { assetId: asset.id, enabled: true, inverted: erase, mode: "luminance" },
      },
    });
    return commands;
  }
  const matrix = geometry.worldMatrix(layerId),
    center = transformPoint(matrix, { x: layer.width / 2, y: layer.height / 2 }),
    source = createLayer("image", {
      id: crypto.randomUUID(),
      name: asset.name,
      assetId: asset.id,
      maskSource: true,
      x: center.x - layer.width / 2,
      y: center.y - layer.height / 2,
      width: layer.width,
      height: layer.height,
      rotation: (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI,
      opacity: 1,
      mask: { ...layer.mask },
      effects: erase ? [createEffect("invert", { id: crypto.randomUUID() })] : [],
    });
  commands.push(
    { type: "addLayers", layers: [source] },
    {
      type: "attachLayerMask",
      sourceId: source.id,
      targetId: layerId,
      mode: "luminance",
    },
  );
  return commands;
}
