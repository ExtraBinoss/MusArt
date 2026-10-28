import { expect, it } from "vitest";
import { createPage } from "@musart/core";
import { createQuickLayer, isQuickLayerAction } from "../../../src/canvas/quick-add/layers";
it("creates centered editable text/primitives, retaining small-artboard bounds", () => {
  for (const [action, kind] of [
    ["toolText", "text"],
    ["toolRectangle", "rectangle"],
    ["toolEllipse", "ellipse"],
  ] as const) {
    expect(isQuickLayerAction(action)).toBe(true);
    const layer = createQuickLayer(action, createPage({ width: 640, height: 480 }), "Bonjour");
    expect(layer.kind).toBe(kind);
    expect(layer.x + layer.width / 2).toBe(320);
    expect(layer.y + layer.height / 2).toBe(240);
    if (kind === "text")
      expect(layer).toEqual(
        expect.objectContaining({ text: "Bonjour", fill: "#202024", fontSize: 48 }),
      );
    else expect(layer.fill).toBe("#2563eb");
    expect(createQuickLayer(action, createPage({ width: 90, height: 80 }), "Test")).toEqual(
      expect.objectContaining({ x: 0, y: 0, width: 90, height: 80 }),
    );
  }
  expect(isQuickLayerAction("toString")).toBe(false);
  expect(isQuickLayerAction("importImages")).toBe(false);
});
