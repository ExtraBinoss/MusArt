import { createPage, createProject, EditorEngine, type Project } from "@musart/core";
import { getAnimationSession } from "../animation/session";
import { ThumbnailPipeline, installThumbnailSchedule } from "../projects/thumbnails";
import { ProjectStore, installAutosave } from "../projects/storage";
import { createDemoProject } from "../projects/demo";
import { SelectionClient } from "../selection/selection";
import { createEditorServices, installClipboard } from "./editor-services";
import type { FontLibraryPort } from "../fonts/model";
import { ThumbnailRenderer } from "../projects/thumbnails/renderer";
import { FontLibrary } from "../fonts/library";
import { ProjectWriteQueue } from "./project-write-queue";
export interface RuntimeOptions {
  store?: ProjectStore;
  project?: Project;
  selection?: SelectionClient;
  autosaveDelay?: number;
  thumbnails?: ThumbnailPipeline;
  signal?: AbortSignal;
  fonts?: FontLibraryPort;
}
export async function createRuntime(
  onError: (error: unknown) => void,
  options: RuntimeOptions = {},
) {
  const store = options.store ?? new ProjectStore();
  const params = new URLSearchParams(location.search),
    benchmark = params.get("benchmark"),
    seeded = params.get("automation") === "1" || benchmark !== null;
  let project = options.project;
  let restored = false;
  await Promise.resolve();
  try {
    options.signal?.throwIfAborted();

    if (!project && benchmark !== null) {
      try {
        const { createPerformanceProject } = await import("../projects/performance-project");
        project = await createPerformanceProject(Number(benchmark));
      } catch (error) {
        onError(error);
      }
    }
    if (!project) {
      try {
        const last = await store.last();
        if (last) {
          project = await store.load(last);
          restored = true;
        }
      } catch (error) {
        onError(error);
      }
    }
    options.signal?.throwIfAborted();
  } catch (error) {
    if (options.signal?.aborted) await store.close();
    throw error;
  }
  const welcome = !project && !seeded;
  project ??= welcome
    ? createProject({
        id: crypto.randomUUID(),
        name: "Untitled",
        pages: [createPage({ name: "Composition 1", layers: [] })],
      })
    : { ...createDemoProject(), id: crypto.randomUUID() };
  const engine = new EditorEngine(project, { now: () => new Date().toISOString() });
  if (!welcome && !restored) {
    try {
      await store.save(project);
    } catch (error) {
      onError(error);
    }
  }
  const selection = options.selection ?? new SelectionClient();
  const fonts = options.fonts ?? new FontLibrary();
  const journal = getAnimationSession(engine);
  const thumbnails =
    options.thumbnails ??
    new ThumbnailPipeline(store, {
      onError,
      renderer: new ThumbnailRenderer(undefined, fonts?.resolve),
    });
  let stopThumbnails: (() => void) | undefined,
    autosave: ReturnType<typeof installAutosave> | undefined,
    removeClipboard: (() => void) | undefined,
    stopDeferred: (() => void) | undefined,
    disposed = false;
  const writes = new ProjectWriteQueue((project) => store.saveCurrent(project));
  const flush = async () => {
    await Promise.all([autosave?.flush(), journal.flush()]);
    await writes.flush();
  };
  const services = createEditorServices(engine, {
    store,
    selection,
    flush,
    thumbnails,
    fonts,
    saveCurrent: writes.save,
  });
  function activatePersistence() {
    if (disposed || autosave) return;
    stopDeferred?.();
    stopDeferred = undefined;
    journal.attach(store.history, onError);
    stopThumbnails = installThumbnailSchedule(engine, thumbnails);
    autosave = installAutosave(engine, { save: writes.save }, onError, options.autosaveDelay);
    removeClipboard = installClipboard(engine, services, onError);
  }
  if (welcome) {
    const draftId = project.id;
    // Creation/opening persists the real project before publishing engine.load.
    // Activation is synchronous so an immediate subsequent edit cannot be lost.
    stopDeferred = engine.subscribe(() => {
      if (engine.getSnapshot().project.id !== draftId) activatePersistence();
    });
  } else activatePersistence();
  const pagehide = () => {
    void flush().catch(onError);
  };
  window.addEventListener("pagehide", pagehide);
  let closing: Promise<void> | undefined;
  return {
    welcome,
    engine,
    services,
    store,
    flush,
    thumbnails,
    async flushThumbnails() {
      await flush();
      await thumbnails.flush();
    },
    dispose() {
      closing ??= (async () => {
        disposed = true;
        window.removeEventListener("pagehide", pagehide);
        stopDeferred?.();
        removeClipboard?.();
        stopThumbnails?.();
        // Stop document observers before awaiting any network/GPU cleanup.
        const saving = autosave?.dispose(),
          history = journal.dispose();
        const drainedWrites = (async () => {
          try {
            await saving;
          } finally {
            await writes.dispose();
          }
        })();
        services.pixelSelection?.dispose();
        fonts.dispose();
        selection.dispose();
        try {
          const results = await Promise.allSettled([thumbnails.dispose(), history, drainedWrites]);
          const errors = results.filter((result) => result.status === "rejected");
          if (errors.length)
            throw new AggregateError(
              errors.map((result) => result.reason),
              "Runtime cleanup failed.",
            );
        } finally {
          await store.close();
        }
      })();
      return closing;
    },
  };
}
export type EditorRuntime = Awaited<ReturnType<typeof createRuntime>>;
