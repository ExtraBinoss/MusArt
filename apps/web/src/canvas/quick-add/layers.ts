import { createLayer, type Composition, type Layer } from "@musart/core";

export type QuickLayerAction = "toolText" | "toolRectangle" | "toolEllipse";
const definitions = {
  toolText: { kind: "text", width: 360, height: 100 },
  toolRectangle: { kind: "rectangle", width: 180, height: 140 },
  toolEllipse: { kind: "ellipse", width: 180, height: 140 },
} as const;
export function isQuickLayerAction(action: string): action is QuickLayerAction {
  return Object.hasOwn(definitions, action);
}

/** Empty-workspace insertion uses the active artboard's center and keeps the frame in bounds. */
export function createQuickLayer(action: QuickLayerAction, page: Composition, text: string): Layer {
  const definition = definitions[action],
    width = Math.min(definition.width, page.width),
    height = Math.min(definition.height, page.height);
  return createLayer(definition.kind, {
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    width,
    height,
    fill: definition.kind === "text" ? "#202024" : "#2563eb",
    fontSize: 48,
    text,
    radius: definition.kind === "rectangle" ? 12 : 0,
  });
}
