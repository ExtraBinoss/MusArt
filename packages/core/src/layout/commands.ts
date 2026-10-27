import { ensure } from "../errors";
import { assertEditable, selectedRoots } from "../layers/access";
import {
  getWorldBounds,
  getWorldMatrix,
  invertMatrix,
  layerTransform,
  transformPoint,
  type Bounds,
} from "../layers/geometry";
import type { Layer } from "../document/model";
import type { CommandContext, CommandHandler } from "../session/context";
function localBounds(layer: Layer): Bounds {
  const matrix = layerTransform(layer);
  const points = [
    { x: 0, y: 0 },
    { x: layer.width, y: 0 },
    { x: layer.width, y: layer.height },
    { x: 0, y: layer.height },
  ].map((point) => transformPoint(matrix, point));
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
function union(boxes: Bounds[]): Bounds {
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
function editableRoots(context: CommandContext, ids: string[]): Layer[] {
  const layers = selectedRoots(context.page, ids);
  ensure(layers.length > 0, "INVALID_COMMAND", "Select layers to arrange");
  for (const layer of layers) assertEditable(context.page, layer);
  return layers;
}
function moveWorld(context: CommandContext, layer: Layer, dx: number, dy: number): void {
  if (!layer.parentId) {
    layer.x += dx;
    layer.y += dy;
    return;
  }
  const inverse = invertMatrix(getWorldMatrix(context.page, layer.parentId));
  layer.x += inverse[0] * dx + inverse[2] * dy;
  layer.y += inverse[1] * dx + inverse[3] * dy;
}
export const alignLayers: CommandHandler<"alignLayers"> = (context, command) => {
  ensure(
    (command.axis === "x" || command.axis === "y") &&
      ["start", "center", "end"].includes(command.alignment) &&
      ["page", "selection", "parent"].includes(command.relativeTo),
    "INVALID_COMMAND",
    "Invalid alignment",
  );
  const layers = editableRoots(context, command.ids),
    axis = command.axis,
    size = axis === "x" ? "width" : "height";
  const pageSpace = command.relativeTo === "page";
  if (!pageSpace)
    ensure(
      layers.every((layer) => layer.parentId === layers[0]!.parentId),
      "INVALID_HIERARCHY",
      "Local arrangement requires siblings",
    );
  const boxes = layers.map((layer) =>
    pageSpace ? getWorldBounds(context.page, layer.id) : localBounds(layer),
  );
  const parent = layers[0]!.parentId
    ? context.page.layers.find((layer) => layer.id === layers[0]!.parentId)!
    : context.page;
  const reference =
    command.relativeTo === "selection"
      ? union(boxes)
      : {
          x: 0,
          y: 0,
          width: pageSpace ? context.page.width : parent.width,
          height: pageSpace ? context.page.height : parent.height,
        };
  const factor = command.alignment === "start" ? 0 : command.alignment === "center" ? 0.5 : 1;
  for (const [index, layer] of layers.entries()) {
    const box = boxes[index]!,
      delta = reference[axis] + reference[size] * factor - box[axis] - box[size] * factor;
    if (pageSpace) moveWorld(context, layer, axis === "x" ? delta : 0, axis === "y" ? delta : 0);
    else layer[axis] += delta;
  }
  return { pageId: context.pageId };
};
export const distributeLayers: CommandHandler<"distributeLayers"> = (context, command) => {
  ensure(
    command.axis === "x" || command.axis === "y",
    "INVALID_COMMAND",
    "Invalid distribution axis",
  );
  const layers = editableRoots(context, command.ids);
  ensure(layers.length >= 3, "INVALID_COMMAND", "Select at least three layers");
  ensure(
    layers.every((layer) => layer.parentId === layers[0]!.parentId),
    "INVALID_HIERARCHY",
    "Local arrangement requires siblings",
  );
  const axis = command.axis,
    size = axis === "x" ? "width" : "height",
    items = layers
      .map((layer) => ({ layer, box: localBounds(layer) }))
      .sort((a, b) => a.box[axis] - b.box[axis] || a.layer.id.localeCompare(b.layer.id));
  const first = items[0]!.box,
    last = items.at(-1)!.box,
    gap =
      (last[axis] +
        last[size] -
        first[axis] -
        items.reduce((sum, item) => sum + item.box[size], 0)) /
      (items.length - 1);
  let cursor = first[axis];
  for (const { layer, box } of items) {
    layer[axis] += cursor - box[axis];
    cursor += box[size] + gap;
  }
  return { pageId: context.pageId };
};
