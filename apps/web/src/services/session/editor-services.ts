import {
  createId,
  PRESETS,
  createLayer,
  createPage,
  createProject,
  parseProject,
  serializeProject,
  selectionComposition,
  type EnginePort,
  type Project,
} from "@musart/core";
import type {
  EditorServices,
  ExportOptions,
  ExportScope,
  NewProjectOptions,
} from "../../state/contracts";
import { getAnimationSession } from "../animation/session";
import type { ThumbnailPipeline } from "../projects/thumbnails";
import { ProjectStore } from "../projects/storage";
import { DeletedProjectError } from "../projects/lifecycle";
import { StaleProjectWriteError } from "../projects/writes/revision";
import { assertExportScope } from "./export-scope";
import { createPreviewExport } from "./previews";
import { importBatch, readDataUrl } from "../assets/imports";
import { downloadBlob, safeName } from "../files/download";
import { maskToDataUrl } from "../selection/pixel-selection";
import { SelectionClient } from "../selection/selection";
import { PixelSelectionController } from "../selection/wand/controller";
import { i18n } from "../../state/i18n";
import "../selection/wand/messages";
import type { FontLibraryPort } from "../fonts/model";
export interface ServiceDependencies {
  fonts?: FontLibraryPort;
  store: ProjectStore;
  thumbnails?: ThumbnailPipeline;
  selection: SelectionClient;
  flush?: () => Promise<void>;
  saveCurrent?: (project: Project) => Promise<void>;
  download?: typeof downloadBlob;
  render?: () => Promise<typeof import("@musart/render")>;
}
export function createEditorServices(
  engine: EnginePort,
  dependencies: ServiceDependencies,
): EditorServices {
  const { store, selection, thumbnails } = dependencies;
  const saveCurrent =
    dependencies.saveCurrent ?? ((project: Project) => store.saveCurrent(project));
  const download = dependencies.download ?? downloadBlob;
  const renderer = dependencies.render ?? (() => import("@musart/render"));
  const pixelSelection = new PixelSelectionController(engine, {
    pixels: async (asset) => (await renderer()).sourcePixels(asset),
    maskName: () => i18n.t("pixelSelection:maskName"),
  });
  const activePage = () => {
    const snapshot = engine.getSnapshot();
    return snapshot.project.pages.find((p) => p.id === snapshot.pageId)!;
  };
  const switchReady = async () => {
    await dependencies.flush?.();
  };
  const create = async (options: NewProjectOptions) => {
    await switchReady();
    const now = new Date().toISOString();
    const preset = PRESETS.find((item) => item.id === options.presetId);
    const safe = preset?.safeArea;
    const project = createProject({
      id: crypto.randomUUID(),
      name: options.name,
      createdAt: now,
      updatedAt: now,
      pages: [
        createPage({
          name: "Composition 1",
          width: options.width,
          height: options.height,
          background: options.background,
          ...(safe
            ? {
                margins: safe,
                rulers: true,
                guides: [
                  { id: createId(), axis: "x" as const, position: safe.left },
                  { id: createId(), axis: "x" as const, position: options.width - safe.right },
                  { id: createId(), axis: "y" as const, position: safe.top },
                  { id: createId(), axis: "y" as const, position: options.height - safe.bottom },
                ],
              }
            : {}),
        }),
      ],
    });
    await store.save(project);
    thumbnails?.schedule(project);
    engine.load(project);
  };
  return {
    pixelSelection,
    ...(thumbnails
      ? {
          previewExport: createPreviewExport(engine, thumbnails),
        }
      : {}),
    ...(dependencies.fonts ? { fonts: dependencies.fonts } : {}),
    listProjects: () => store.list(),
    listProjectPage: (options) => store.listPage(options),
    loadProjectThumbnails: async (id, pageIds) =>
      thumbnails ? thumbnails.acquire(id, pageIds) : { items: [], release: () => {} },
    subscribeProjectThumbnails: (listener) => thumbnails?.subscribe(listener) ?? (() => {}),
    flushThumbnails: async () => {
      await switchReady();
      await thumbnails?.flush();
    },
    async projectInsights(id) {
      const usage = await store.usage(id),
        origin = await store.estimateOriginStorage();
      return { ...usage, ...(origin ? { origin } : {}) };
    },
    async renameProject(id, name) {
      await switchReady();
      if (engine.getSnapshot().project.id === id) {
        engine.execute({ type: "renameProject", name });
        await saveCurrent(engine.getSnapshot().project);
        await dependencies.flush?.();
      } else await store.rename(id, name);
    },
    async clearHistory(id) {
      await switchReady();
      if (engine.getSnapshot().project.id === id) await getAnimationSession(engine).clear();
      else {
        const project = await store.load(id, { observe: false });
        await store.history.clear(project, project.pages[0]!.id);
      }
    },
    async openProject(id) {
      await switchReady();
      const project = await store.load(id, { remember: true });
      engine.load(project);
    },
    createProject: create,
    async saveProject() {
      const origin = engine.getSnapshot().project.id;
      // The shared writer already orders this write, including retries after a failed save.
      if (!dependencies.saveCurrent) await switchReady();
      const project = engine.getSnapshot().project;
      if (project.id !== origin) throw new StaleProjectWriteError(origin);
      await saveCurrent(project);
      thumbnails?.schedule(project);
    },
    async deleteProject(id) {
      await switchReady();
      thumbnails?.remove(id);
      await store.remove(id);
      if (engine.getSnapshot().project.id === id) {
        const projects = await store.list();
        if (projects[0]) {
          const replacement = await store.load(projects[0].id);
          await saveCurrent(replacement);
          engine.load(replacement);
        } else
          await create({ name: "Sans titre", width: 1080, height: 1080, background: "#ffffff" });
      }
    },
    async duplicateProject(id) {
      await switchReady();
      const source = await store.load(id, { observe: false });
      const now = new Date().toISOString();
      const duplicate = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} — copie`,
        createdAt: now,
        updatedAt: now,
      };
      await store.save(duplicate, undefined, { remember: false });
      for (const thumbnail of await store.thumbnails(id))
        await store.saveThumbnail({ ...thumbnail, projectId: duplicate.id, updatedAt: now });
      thumbnails?.schedule(duplicate);
    },
    async importFiles(files) {
      const snapshot = engine.getSnapshot();
      const command = await importBatch(files, activePage());
      const current = engine.getSnapshot();
      if (current.project.id !== snapshot.project.id || current.pageId !== snapshot.pageId)
        throw new Error("La composition a changé pendant l’import. Réessayez.");
      engine.execute(command);
      if (command.type === "addLayers") engine.select(command.layers.map((layer) => layer.id));
    },
    async openPortable(file) {
      if (file.size > 200 * 1024 * 1024)
        throw new Error("Projet trop volumineux (maximum 200 Mo).");
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("Contenu du fichier invalide."));
        };
        reader.onerror = () => reject(new Error("Lecture du projet impossible."));
        reader.readAsText(file);
      });
      const parsed = parseProject(text);
      const exists = (await store.list()).some((item) => item.id === parsed.id);
      const deleted = await store.isDeleted(parsed.id);
      let project = exists || deleted ? { ...parsed, id: crypto.randomUUID() } : parsed;
      await switchReady();
      try {
        await store.save(project);
      } catch (error) {
        // Another session can retire the identity after the import's initial read.
        if (!(error instanceof DeletedProjectError)) throw error;
        project = { ...parsed, id: crypto.randomUUID() };
        await store.save(project);
      }
      thumbnails?.schedule(project);
      engine.load(project);
    },
    async exportProject() {
      const project = engine.getSnapshot().project;
      download(
        new Blob([serializeProject(project)], { type: "application/json" }),
        `${safeName(project.name)}.musart`,
      );
    },
    async exportImage(options: ExportOptions, scope?: ExportScope) {
      const snapshot = engine.getSnapshot(),
        { project } = snapshot;
      assertExportScope(snapshot, scope);
      const pages = options.allPages
        ? project.pages
        : [
            options.selectionOnly
              ? selectionComposition(activePage(), snapshot.selection, [
                  project.id,
                  ...project.pages.map((item) => item.id),
                  ...Object.keys(project.assets),
                ])
              : activePage(),
          ];
      const { exportComposition } = await renderer();
      const output: Record<string, Uint8Array> = {};
      for (const [index, page] of pages.entries()) {
        const blob = await exportComposition(page, project.assets, {
          ...options,
          ...(dependencies.fonts ? { fontResolver: dependencies.fonts.resolve } : {}),
        });
        const filename = `${safeName(page.name)}.${options.format === "jpeg" ? "jpg" : options.format}`;
        if (!options.allPages) {
          download(blob, filename);
          return;
        }
        output[`${String(index + 1).padStart(2, "0")}-${filename}`] = new Uint8Array(
          await blob.arrayBuffer(),
        );
      }
      const { zipSync } = await import("fflate");
      download(
        new Blob([zipSync(output, { level: 0 })], { type: "application/zip" }),
        `${safeName(project.name)}.zip`,
      );
    },
    async selectImagePoint(layerId, x, y, mode, tolerance) {
      if (mode === "wand") {
        engine.select([layerId]);
        await pixelSelection.begin(layerId, x, y, tolerance);
        await pixelSelection.accept();
        return;
      }
      const snapshot = engine.getSnapshot(),
        page = activePage(),
        layer = page.layers.find((layer) => layer.id === layerId);
      const asset = layer?.assetId ? snapshot.project.assets[layer.assetId] : undefined;
      if (!layer || layer.kind !== "image" || !asset)
        throw new Error("Sélectionnez un calque image.");
      if (layer.locked) throw new Error("Le calque est verrouillé.");
      const sx = Math.max(0, Math.min(asset.width - 1, (x / layer.width) * asset.width)),
        sy = Math.max(0, Math.min(asset.height - 1, (y / layer.height) * asset.height));
      const result = await selection.segment(asset.dataUrl, sx, sy);
      const latest = engine.getSnapshot();
      if (
        latest.project.id !== snapshot.project.id ||
        latest.pageId !== snapshot.pageId ||
        activePage().layers.find((l) => l.id === layerId)?.assetId !== asset.id
      )
        throw new Error("La cible a changé. Le masque a été abandonné.");
      const mask = {
        id: crypto.randomUUID(),
        name: `Masque — ${layer.name}`,
        mime: "image/png",
        width: result.width,
        height: result.height,
        dataUrl: maskToDataUrl(result.data, result.width, result.height),
      };
      engine.transaction([
        { type: "addAssets", assets: [mask] },
        {
          type: "updateLayers",
          ids: [layerId],
          patch: { mask: { assetId: mask.id, enabled: true, inverted: false } },
        },
      ]);
    },
    segmentationModel: selection.model,
    prepareSegmentation: () => (selection.model ? selection.model.prepare() : selection.prepare()),
  };
}
// Clipboard text and files deliberately share the same command/import paths as the UI.
export function installClipboard(
  engine: EnginePort,
  services: Pick<EditorServices, "importFiles">,
  onError: (error: unknown) => void,
) {
  const paste = (event: ClipboardEvent) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))
    )
      return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const files = Array.from(clipboard.files);
    if (files.length) {
      event.preventDefault();
      void services.importFiles(files).catch(onError);
      return;
    }
    const text = clipboard.getData("text/plain");
    if (!text.trim()) return;
    event.preventDefault();
    try {
      const layer = createLayer("text", {
        name: text.slice(0, 32),
        text,
        width: 480,
        height: Math.max(70, text.split("\n").length * 50),
        x: 100,
        y: 100,
        fontSize: 40,
      });
      engine.execute({ type: "addLayers", layers: [layer] });
      engine.select([layer.id]);
    } catch (error) {
      onError(error);
    }
  };
  document.addEventListener("paste", paste);
  return () => document.removeEventListener("paste", paste);
}
// Kept as a public low-level adapter for drag/drop and external automation.
export { readDataUrl };
