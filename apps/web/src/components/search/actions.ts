import { createEffect, createPage, createLayerGeometryIndex, type EnginePort } from "@musart/core";
import type { Tool } from "../../canvas/EditorCanvas";
import { createViewportActions } from "../../canvas/session/viewport-actions";
import type { EditorServices } from "../../state/contracts";
import type { Theme } from "../../state/session/editor";
import { snappingPreferences } from "../../state/snapping/preferences";
import type { SearchAction, SearchItem, SearchTranslate } from "./catalog/model";
import { capturePresentationDelete, attachmentSelection } from "../../state/selection/attachments";
import { createClipboardController } from "../../services/clipboard/controller";

export type ProjectView = "projects" | "newProject" | "settings" | "settingsEditor";
export type PanelMode = "design" | "animate";
export interface SearchActions {
  engine: EnginePort;
  services: EditorServices;
  t: SearchTranslate;
  onImport: () => void;
  onImportSvg: () => void;
  onOpenPortable: () => void;
  onProjects: (view: ProjectView) => void;
  onExport: () => void;
  onPanelMode: (mode: PanelMode) => void;
  onShortcuts: () => void;
  setTool: (tool: Tool) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: "en" | "fr") => Promise<void>;
}
function selection(engine: EnginePort) {
  const snapshot = engine.getSnapshot();
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  const selectedIds = new Set(snapshot.selection);
  return {
    snapshot,
    page,
    selected: page.layers.filter((layer) => selectedIds.has(layer.id)),
  };
}
/** Actions share the public command/service ports used by buttons and shortcuts. */
export function createSearchActions(context: SearchActions) {
  const { engine, services, t } = context;
  const view = createViewportActions(engine);
  const selectedCommand = (
    type: "duplicateLayers" | "deleteLayers" | "groupLayers" | "ungroupLayers",
  ) => {
    engine.execute({ type, ids: engine.getSnapshot().selection });
  };
  return {
    toolPointer: () => context.setTool("pointer"),
    toolHand: () => context.setTool("hand"),
    toolShape: () => context.setTool("shape"),
    toolRectangle: () => context.setTool("rectangle"),
    toolEllipse: () => context.setTool("ellipse"),
    toolText: () => context.setTool("text"),
    toolWand: () => context.setTool("wand"),
    toolSegment: () => context.setTool("segment"),
    importImages: context.onImport,
    importSvg: context.onImportSvg,
    openPortable: context.onOpenPortable,
    exportImage: context.onExport,
    exportProject: services.exportProject,
    projects: () => context.onProjects("projects"),
    newProject: () => context.onProjects("newProject"),
    save: services.saveProject,
    addPage: () => {
      const { page, snapshot } = selection(engine);
      engine.execute({
        type: "addPage",
        page: createPage({
          name: `${t("composition")} ${snapshot.project.pages.length + 1}`,
          width: page.width,
          height: page.height,
          background: page.background,
        }),
      });
    },
    addTechnoArtboard: async () => {
      const project = engine.getSnapshot().project.id;
      const { createTechnoArtboard } = await import("../../services/projects/templates/techno");
      if (engine.getSnapshot().project.id !== project) throw new Error(t("search:templateChanged"));
      const page = createTechnoArtboard();
      engine.execute({ type: "addPage", page });
      engine.setPage(page.id);
    },
    undo: engine.undo,
    redo: engine.redo,
    copy: () => createClipboardController(engine).copy(),
    paste: () => createClipboardController(engine).paste(),
    copyComposition: () => createClipboardController(engine).copy(true),
    duplicate: () => selectedCommand("duplicateLayers"),
    delete: () => capturePresentationDelete(engine)(),
    group: () => selectedCommand("groupLayers"),
    ungroup: () => selectedCommand("ungroupLayers"),
    selectAll: () => engine.select(selection(engine).page.layers.map((layer) => layer.id)),
    deselect: () => {
      attachmentSelection(engine).clear();
      engine.select([]);
    },
    toggleVisibility: () => {
      const { selected } = selection(engine);
      engine.execute({
        type: "updateLayers",
        ids: selected.map((layer) => layer.id),
        patch: { visible: !selected.every((layer) => layer.visible) },
      });
    },
    toggleLock: () => {
      const { selected } = selection(engine);
      engine.execute({
        type: "updateLayers",
        ids: selected.map((layer) => layer.id),
        patch: { locked: !selected.every((layer) => layer.locked) },
      });
    },
    fit: () => {
      view.run("fit");
    },
    reset: () => {
      view.run("reset");
    },
    recenter: () => {
      view.run("recenter");
    },
    zoomIn: () => {
      view.run("zoomIn");
    },
    zoomOut: () => {
      view.run("zoomOut");
    },
    rulers: () =>
      engine.execute({ type: "updatePage", patch: { rulers: !selection(engine).page.rulers } }),
    design: () => context.onPanelMode("design"),
    animate: () => context.onPanelMode("animate"),
    settings: () => context.onProjects("settings"),
    editorSettings: () => context.onProjects("settingsEditor"),
    enableSnapping: () => {
      snappingPreferences.update({ enabled: true });
    },
    disableSnapping: () => {
      snappingPreferences.update({ enabled: false });
    },
    themeLight: () => context.setTheme("light"),
    themeDark: () => context.setTheme("dark"),
    themeSystem: () => context.setTheme("system"),
    languageEnglish: () => context.setLanguage("en"),
    languageFrench: () => context.setLanguage("fr"),
    shortcuts: context.onShortcuts,
  } satisfies Record<SearchAction, () => void | Promise<void>>;
}
export function executeSearchItem(item: SearchItem, context: SearchActions): void | Promise<void> {
  const { target } = item;
  if (target.kind === "action") return createSearchActions(context)[target.action]();
  if (target.kind === "page") return context.engine.setPage(target.pageId);
  if (target.kind === "layer") {
    attachmentSelection(context.engine).clear();
    context.engine.setPage(target.pageId);
    context.engine.select([target.layerId]);
    return;
  }
  const { page, selected } = selection(context.engine);
  const geometry = createLayerGeometryIndex(page);
  if (!selected.length || selected.some((layer) => geometry.isLocked(layer.id)))
    throw new Error(context.t("search:noSelection"));
  context.engine.transaction(
    selected.map((layer) => ({
      type: "updateLayers",
      ids: [layer.id],
      patch: { effects: [...layer.effects, createEffect(target.effect)] },
    })),
  );
}
/** Preserve a destructive UI target while a dialog closes or a task adapter defers execution. */
export function captureSearchItem(
  item: SearchItem,
  context: SearchActions,
): () => void | Promise<void> {
  return item.target.kind === "action" && item.target.action === "delete"
    ? capturePresentationDelete(context.engine)
    : () => executeSearchItem(item, context);
}
