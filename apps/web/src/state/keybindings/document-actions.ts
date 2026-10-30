import { createMotionTransport } from "../../services/motion/transport";
import { getAncestors, getWorldMatrix, invertMatrix, type EnginePort } from "@musart/core";
import type { Tool } from "../../canvas/EditorCanvas";
import type { CommandId } from "./model";
import { capturePresentationDelete } from "../selection/attachments";
import { createClipboardController } from "../../services/clipboard/controller";

interface Context {
  engine: EnginePort;
  save: () => Promise<void>;
  setTool: (tool: Tool) => void;
}
/** The headless document subset also works when the visual command surface is not mounted. */
export function documentShortcut(
  id: CommandId,
  context: Context,
): (() => void | Promise<void>) | undefined {
  const { engine } = context;
  if (id === "action:togglePlayback") {
    const transport = createMotionTransport(engine);
    if (transport.read().mode !== "motion") return;
    return () => {
      if (transport.read().playing) transport.pause();
      else transport.play();
    };
  }
  const tools: Partial<Record<CommandId, Tool>> = {
    "action:toolPointer": "pointer",
    "action:toolHand": "hand",
    "action:toolShape": "shape",
    "action:toolRectangle": "rectangle",
    "action:toolEllipse": "ellipse",
    "action:toolText": "text",
    "action:toolWand": "wand",
    "action:toolSegment": "segment",
  };
  const tool = tools[id];
  if (tool) return () => context.setTool(tool);
  if (id === "action:delete") return capturePresentationDelete(engine);
  const selected =
    (type: "deleteLayers" | "duplicateLayers" | "groupLayers" | "ungroupLayers") => () => {
      const ids = engine.getSnapshot().selection;
      if (ids.length) engine.execute({ type, ids });
    };
  const actions: Partial<Record<CommandId, () => void | Promise<void>>> = {
    "action:save": context.save,
    "action:copy": () => createClipboardController(engine).copy(),
    "action:paste": () => createClipboardController(engine).paste(),
    "action:copyComposition": () => createClipboardController(engine).copy(true),
    "action:undo": engine.undo,
    "action:redo": engine.redo,
    "action:duplicate": selected("duplicateLayers"),
    "action:group": selected("groupLayers"),
    "action:ungroup": selected("ungroupLayers"),
    "action:deselect": () => engine.select([]),
    "action:selectAll": () => {
      const snapshot = engine.getSnapshot(),
        page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
      engine.select(page.layers.map((layer) => layer.id));
    },
  };
  if (!id.startsWith("nudge:")) return actions[id];
  return () => {
    const snapshot = engine.getSnapshot(),
      page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
    const distance = id.endsWith("Large") ? 10 : 1,
      dx = id.includes("Left") ? -distance : id.includes("Right") ? distance : 0,
      dy = id.includes("Up") ? -distance : id.includes("Down") ? distance : 0,
      selected = new Set(snapshot.selection);
    engine.transaction(
      page.layers
        .filter(
          (layer) =>
            selected.has(layer.id) &&
            !layer.locked &&
            !getAncestors(page, layer.id).some(
              (parent) => parent.locked || selected.has(parent.id),
            ),
        )
        .map((layer) => {
          const inverse = layer.parentId
            ? invertMatrix(getWorldMatrix(page, layer.parentId))
            : [1, 0, 0, 1];
          return {
            type: "updateLayers" as const,
            ids: [layer.id],
            patch: {
              x: layer.x + inverse[0]! * dx + inverse[2]! * dy,
              y: layer.y + inverse[1]! * dx + inverse[3]! * dy,
            },
          };
        }),
    );
  };
}
