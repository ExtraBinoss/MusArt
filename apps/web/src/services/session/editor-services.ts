import { confirmExportLeave, ExportLeaveCancelled } from "../export/leave";
import { beginProjectTiming } from "../performance/project-timing";
import {
  createId,
  isOriginalMediaAsset,
  isImageAsset,
  PRESETS,
  createLayer,
  createPage,
  createProject,
  parseProject,
  serializeProject,
  selectionComposition,
  type EnginePort,
  type Project,
  type MotionInitializationPlan,
} from "@musart/core";
import type {
  EditorServices,
  ExportOptions,
  ExportScope,
  NewProjectOptions,
} from "../../state/contracts";
import { getMotionConfirmation } from "../../state/session/motion-confirmation";
import { createMotionTransport } from "../motion/transport";
import { getAnimationSession } from "../animation/session";
import type { ThumbnailPipeline } from "../projects/thumbnails";
import { ProjectStore } from "../projects/storage";
import { DeletedProjectError } from "../projects/lifecycle";
import { StaleProjectWriteError } from "../projects/writes/revision";
import { createMediaProjectOpener } from "./media-project";
import { assertExportScope } from "./export-scope";
import { createCompositionExporter } from "../export/composition";
import { createPreviewExport } from "./previews";
import { importMediaFiles } from "../assets/media-import";
import { importBatch, readDataUrl } from "../assets/imports";
import { downloadBlob, safeName } from "../files/download";
import { maskToDataUrl } from "../selection/pixel-selection";
import { SelectionClient } from "../selection/selection";
import { PixelSelectionController } from "../selection/wand/controller";
import { i18n } from "../../state/i18n";
import "../selection/wand/messages";
import type { FontLibraryPort } from "../fonts/model";
import { isEditingShortcutTarget } from "../../state/keybindings/matching";
import { isMusArtClipboardText } from "../clipboard/controller";
import { freezeEffectPreviews } from "../../state/session/effect-preview";
export interface ServiceDependencies {
  fonts?: FontLibraryPort;
  confirmMotion?: (plan: MotionInitializationPlan) => Promise<boolean>;
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
  const mediaResolvers = new Map<string, import("@musart/render").MediaSourceResolver>();
  const mediaResolverFor = (projectId: string) => {
    let resolver = mediaResolvers.get(projectId);
    if (!resolver) {
      resolver = {
        resolveOriginal: (asset, options) => store.loadMediaOriginal(projectId, asset, options),
      };
      mediaResolvers.set(projectId, resolver);
      if (mediaResolvers.size > 64) mediaResolvers.delete(mediaResolvers.keys().next().value!);
    }
    return resolver;
  };
  const exportComposition = createCompositionExporter(engine, {
    render: renderer,
    download,
    mediaResolverFor,
    fontResolver: dependencies.fonts?.resolve,
  });
  const activePage = () => {
    const snapshot = engine.getSnapshot();
    return snapshot.project.pages.find((p) => p.id === snapshot.pageId)!;
  };
  const switchReady = async () => {
    if (!(await confirmExportLeave())) throw new ExportLeaveCancelled();
    await dependencies.flush?.();
  };
  const create = async (options: NewProjectOptions) => {
    const timing = beginProjectTiming("Create project", { name: options.name });
    try {
      timing?.stage("Wait for previous project saves");
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
            ...(options.colorSpace ? { colorSpace: options.colorSpace } : {}),
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
      timing?.stage("Persist new project");
      await store.save(project);
      thumbnails?.schedule(project);
      timing?.stage("Publish document");
      engine.load(project);
      timing?.waitForFrame(engine.getSnapshot());
    } catch (error) {
      timing?.finish("failed", error);
      throw error;
    }
  };
  return {
    exportComposition,
    projectPreferences: store.preferences,
    pixelSelection,
    mediaResolverFor,
    openMediaProject: createMediaProjectOpener(engine, {
      store,
      flush: switchReady,
      schedule: (project) => thumbnails?.schedule(project),
    }),
    ...(thumbnails
      ? {
          previewExport: createPreviewExport(engine, thumbnails, mediaResolverFor),
        }
      : {}),
    ...(dependencies.fonts ? { fonts: dependencies.fonts } : {}),
    loadProjectPreview: (id, options) => store.loadPreview(id, options),
    listProjects: () => store.list(),
    listProjectPage: (options) => store.listPage(options),
    loadProjectThumbnails: async (id, pageIds, options) =>
      thumbnails ? thumbnails.acquire(id, pageIds, options) : { items: [], release: () => {} },
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
      const timing = beginProjectTiming("Open saved project", { projectId: id });
      try {
        timing?.stage("Wait for previous project saves");
        await switchReady();
        timing?.stage("Read + validate saved project");
        const project = await store.load(id, { remember: true });
        timing?.identify(project.name);
        timing?.stage("Publish document");
        engine.load(project);
        timing?.waitForFrame(engine.getSnapshot());
      } catch (error) {
        timing?.finish("failed", error);
        throw error;
      }
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
      const originals = await Promise.all(
        [
          ...new Map(
            Object.values(source.assets)
              .filter(isOriginalMediaAsset)
              .map((asset) => [asset.originalId, asset]),
          ).values(),
        ].map(async (asset) => ({
          originalId: asset.originalId,
          contentRevision: asset.contentRevision,
          blob: await store.loadMediaOriginal(id, asset),
        })),
      );
      await store.save(duplicate, undefined, { remember: false, mediaOriginals: originals });
      for (const thumbnail of await store.thumbnails(id))
        await store.saveThumbnail({ ...thumbnail, projectId: duplicate.id, updatedAt: now });
      thumbnails?.schedule(duplicate);
    },
    async importFiles(files) {
      if (files.some((file) => /^(?:video|audio)\//.test(file.type))) {
        await importMediaFiles(
          engine,
          files,
          {
            store,
            flush: switchReady,
            confirm: dependencies.confirmMotion ?? getMotionConfirmation(engine).request,
            probe: async (file, options) => (await renderer()).probeVideoOriginal(file, options),
            probeAudio: async (file, options) =>
              (await renderer()).probeAudioOriginal(file, options),
          },
          { at: createMotionTransport(engine).read().time },
        );
        return;
      }
      const snapshot = engine.getSnapshot();
      const command = await importBatch(files, activePage());
      const current = engine.getSnapshot();
      if (current.project.id !== snapshot.project.id || current.pageId !== snapshot.pageId)
        throw new Error("La composition a changé pendant l’import. Réessayez.");
      engine.execute(command);
      if (command.type === "addLayers") engine.select(command.layers.map((layer) => layer.id));
    },
    async openPortable(file) {
      const timing = beginProjectTiming("Import project", { file: file.name });
      try {
        timing?.stage("Read portable file");
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
        timing?.stage("Parse + validate document");
        const parsed = parseProject(text);
        timing?.identify(parsed.name);
        const exists = (await store.list()).some((item) => item.id === parsed.id);
        const deleted = await store.isDeleted(parsed.id);
        let project = exists || deleted ? { ...parsed, id: crypto.randomUUID() } : parsed;
        timing?.stage("Wait for previous project saves");
        await switchReady();
        timing?.stage("Persist imported project");
        try {
          await store.save(project);
        } catch (error) {
          // Another session can retire the identity after the import's initial read.
          if (!(error instanceof DeletedProjectError)) throw error;
          project = { ...parsed, id: crypto.randomUUID() };
          await store.save(project);
        }
        thumbnails?.schedule(project);
        timing?.stage("Publish document");
        engine.load(project);
        timing?.waitForFrame(engine.getSnapshot());
      } catch (error) {
        timing?.finish("failed", error);
        throw error;
      }
    },
    async exportProject() {
      freezeEffectPreviews(engine);
      const project = engine.getSnapshot().project;
      if (Object.values(project.assets).some(isOriginalMediaAsset))
        throw Error(
          "Media projects require a binary portable archive; JSON export is unavailable until archive support is installed.",
        );
      download(
        new Blob([serializeProject(project)], { type: "application/json" }),
        `${safeName(project.name)}.musart`,
      );
    },
    async exportImage(options: ExportOptions, scope?: ExportScope) {
      options.signal?.throwIfAborted();
      freezeEffectPreviews(engine);
      const snapshot = engine.getSnapshot(),
        { project } = snapshot;
      assertExportScope(snapshot, scope);
      const transport = createMotionTransport(engine);
      transport.pause();
      const active = transport.readFrame() ?? activePage(),
        motionFrame = transport.readFramePlan();
      const pages = options.allPages
        ? project.pages
        : [
            options.selectionOnly
              ? selectionComposition(active, snapshot.selection, [
                  project.id,
                  ...project.pages.map((item) => item.id),
                  ...Object.keys(project.assets),
                ])
              : active,
          ];
      const { exportComposition } = await renderer();
      const output: Record<string, Uint8Array> = {};
      for (const [index, page] of pages.entries()) {
        options.signal?.throwIfAborted();
        const blob = await exportComposition(page, project.assets, {
          ...options,
          mediaResolver: mediaResolverFor(project.id),
          ...(motionFrame && page.id === motionFrame.compositionId ? { motionFrame } : {}),
          ...(dependencies.fonts ? { fontResolver: dependencies.fonts.resolve } : {}),
        });
        const filename = `${safeName(page.name)}.${options.format === "jpeg" ? "jpg" : options.format}`;
        if (!options.allPages) {
          options.signal?.throwIfAborted();
          download(blob, filename);
          return;
        }
        output[`${String(index + 1).padStart(2, "0")}-${filename}`] = new Uint8Array(
          await blob.arrayBuffer(),
        );
      }
      const { zipSync } = await import("fflate");
      options.signal?.throwIfAborted();
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
      if (!layer || layer.kind !== "image" || !asset || !isImageAsset(asset))
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
    if (event.defaultPrevented || isEditingShortcutTarget(event.target)) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const files = Array.from(clipboard.files);
    if (files.length) {
      event.preventDefault();
      void services.importFiles(files).catch(onError);
      return;
    }
    const text = clipboard.getData("text/plain");
    // A disabled structured-paste binding must never turn a portable graph into
    // a literal JSON text layer. Its capture listener owns this format.
    if (!text.trim() || isMusArtClipboardText(text)) return;
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
