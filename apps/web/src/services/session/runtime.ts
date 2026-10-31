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
import { ThumbnailActivity } from "../projects/thumbnails/activity";
import { freezeEffectPreviews } from "../../state/session/effect-preview";
import { MotionAudioSession } from "../motion/audio/session";
import { createRenderActivity } from "./render-activity";
export interface RuntimeOptions {
  store?: ProjectStore;
  project?: Project;
  selection?: SelectionClient;
  autosaveDelay?: number;
  thumbnails?: ThumbnailPipeline;
  signal?: AbortSignal;
  fonts?: FontLibraryPort;
  projectId?: string;
  editor?: boolean;
  library?: boolean;
}
export async function createRuntime(
  onError: (error: unknown) => void,
  options: RuntimeOptions = {},
) {
  const store = options.store ?? new ProjectStore();
  const params = new URLSearchParams(location.search),
    benchmark = params.get("benchmark"),
    seeded = !options.library && (params.get("automation") === "1" || benchmark !== null);
  let project = options.project;
  let restored = false;
  await Promise.resolve();
  try {
    options.signal?.throwIfAborted();

    if (!project && options.projectId) {
      project = await store.load(options.projectId);
      restored = true;
    }
    if (!project && !options.library && benchmark !== null) {
      try {
        const { createPerformanceProject } = await import("../projects/performance-project");
        project = await createPerformanceProject(Number(benchmark));
      } catch (error) {
        onError(error);
      }
    }
    if (!project && !options.library) {
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
    if (options.signal?.aborted || options.projectId) await store.close();
    throw error;
  }
  const welcome = !project && !seeded && !options.editor;
  project ??= !seeded
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
      activity: new ThumbnailActivity(600, window, createRenderActivity(engine)),
      renderer: new ThumbnailRenderer(undefined, fonts?.resolve),
    });
  let stopThumbnails: (() => void) | undefined,
    autosave: ReturnType<typeof installAutosave> | undefined,
    removeClipboard: (() => void) | undefined,
    stopDeferred: (() => void) | undefined,
    disposed = false;
  const writes = new ProjectWriteQueue(async (project) => {
    await store.saveCurrent(project);
    if (!disposed && engine.getSnapshot().project === project) thumbnails.schedule(project);
  });
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
  const audio = new MotionAudioSession(engine, services, onError);
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
        freezeEffectPreviews(engine, false);
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
          const results = await Promise.allSettled([
            thumbnails.dispose(),
            history,
            drainedWrites,
            audio.dispose(),
          ]);
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
