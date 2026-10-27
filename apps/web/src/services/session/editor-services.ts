import {
  createId,
  createLayer,
  createPage,
  createProject,
  parseProject,
  serializeProject,
  type EnginePort,
} from "@musart/core";
import type { EditorServices, ExportOptions, NewProjectOptions } from "../../state/contracts";
import { ProjectStore } from "../projects/storage";
import { importBatch, readDataUrl } from "../assets/imports";
import { downloadBlob, safeName } from "../files/download";
import { maskToDataUrl } from "../selection/pixel-selection";
import { SelectionClient } from "../selection/selection";
export interface ServiceDependencies {
  store: ProjectStore;
  selection: SelectionClient;
  flush?: () => Promise<void>;
  download?: typeof downloadBlob;
  render?: () => Promise<typeof import("@musart/render")>;
}
export function createEditorServices(
  engine: EnginePort,
  dependencies: ServiceDependencies,
): EditorServices {
  const { store, selection } = dependencies;
  const download = dependencies.download ?? downloadBlob;
  const renderer = dependencies.render ?? (() => import("@musart/render"));
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
    const project = createProject({
      name: options.name,
      createdAt: now,
      updatedAt: now,
      pages: [
        createPage({
          name: "Composition 1",
          width: options.width,
          height: options.height,
          background: options.background,
        }),
      ],
    });
    await store.save(project);
    engine.load(project);
  };
  return {
    listProjects: () => store.list(),
    async openProject(id) {
      await switchReady();
      const project = await store.load(id);
      engine.load(project);
      await store.save(project);
    },
    createProject: create,
    async saveProject() {
      const project = engine.getSnapshot().project;
      await store.save(project);
      const page = activePage();
      try {
        const preview = await (
          await renderer()
        ).renderComposition(page, project.assets, {
          scale: Math.min(1, 320 / Math.max(page.width, page.height)),
        });
        if (engine.getSnapshot().project === project)
          await store.save(project, preview.toDataURL("image/webp", 0.7));
      } catch {
        throw new Error("Projet enregistré. La miniature n’a pas pu être générée.");
      }
    },
    async deleteProject(id) {
      await switchReady();
      await store.remove(id);
      if (engine.getSnapshot().project.id === id) {
        const projects = await store.list();
        if (projects[0]) {
          engine.load(await store.load(projects[0].id));
        } else
          await create({ name: "Sans titre", width: 1080, height: 1080, background: "#ffffff" });
      }
    },
    async duplicateProject(id) {
      await switchReady();
      const source = await store.load(id);
      const now = new Date().toISOString();
      await store.save({
        ...source,
        id: createId(),
        name: `${source.name} — copie`,
        createdAt: now,
        updatedAt: now,
      });
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
      const project = parseProject(text);
      await switchReady();
      await store.save(project);
      engine.load(project);
    },
    async exportProject() {
      const project = engine.getSnapshot().project;
      download(
        new Blob([serializeProject(project)], { type: "application/json" }),
        `${safeName(project.name)}.musart`,
      );
    },
    async exportImage(options: ExportOptions) {
      const { project } = engine.getSnapshot();
      const pages = options.allPages ? project.pages : [activePage()];
      const { exportComposition } = await renderer();
      const output: Record<string, Uint8Array> = {};
      for (const [index, page] of pages.entries()) {
        const blob = await exportComposition(page, project.assets, options);
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
      const snapshot = engine.getSnapshot(),
        page = activePage(),
        layer = page.layers.find((layer) => layer.id === layerId);
      const asset = layer?.assetId ? snapshot.project.assets[layer.assetId] : undefined;
      if (!layer || layer.kind !== "image" || !asset)
        throw new Error("Sélectionnez un calque image.");
      if (layer.locked) throw new Error("Le calque est verrouillé.");
      const sx = Math.max(0, Math.min(asset.width - 1, (x / layer.width) * asset.width)),
        sy = Math.max(0, Math.min(asset.height - 1, (y / layer.height) * asset.height));
      const result =
        mode === "segment"
          ? await selection.segment(asset.dataUrl, sx, sy)
          : await (async () => {
              const pixels = await (await renderer()).sourcePixels(asset);
              return selection.wand(pixels.data, pixels.width, pixels.height, sx, sy, tolerance);
            })();
      const latest = engine.getSnapshot();
      if (
        latest.project.id !== snapshot.project.id ||
        latest.pageId !== snapshot.pageId ||
        activePage().layers.find((l) => l.id === layerId)?.assetId !== asset.id
      )
        throw new Error("La cible a changé. Le masque a été abandonné.");
      const mask = {
        id: createId(),
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
    prepareSegmentation: () => selection.prepare(),
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
