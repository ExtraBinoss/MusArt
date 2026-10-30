import { beginProjectTiming } from "../performance/project-timing";
import { MediaStorageError } from "../projects/media/errors";
import { type EnginePort, type Project } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import type { ProjectStore } from "../projects/storage";

export interface MediaProjectDependencies {
  store: Pick<ProjectStore, "prepareSave" | "persistPrepared" | "list" | "isDeleted">;
  flush?: () => Promise<void>;
  schedule?: (project: Project) => void;
}
/** Expensive preparation stays outside the short engine + durable publication critical section. */
export function createMediaProjectOpener(
  engine: EnginePort,
  dependencies: MediaProjectDependencies,
): NonNullable<EditorServices["openMediaProject"]> {
  return async (input, originals, options = {}) => {
    if (!engine.reserveTransaction)
      throw new MediaStorageError(
        "VIDEO_IMPORT_UNAVAILABLE",
        "Atomic media import is unavailable for this session.",
      );
    const timing = options.timing ?? beginProjectTiming("Install project", { projectId: input.id });
    timing?.identify(input.name);
    try {
      const origin =
        options.expectedOrigin ??
        (() => {
          const snapshot = engine.getSnapshot();
          return {
            projectId: snapshot.project.id,
            pageId: snapshot.pageId,
            revision: snapshot.revision,
          };
        })();
      const assertOrigin = () => {
        options.signal?.throwIfAborted();
        const snapshot = engine.getSnapshot();
        if (
          snapshot.project.id !== origin.projectId ||
          snapshot.pageId !== origin.pageId ||
          snapshot.revision !== origin.revision
        )
          throw new DOMException(
            "The editing origin changed during media preparation.",
            "AbortError",
          );
      };
      assertOrigin();
      timing?.stage("Wait for previous project saves");
      await dependencies.flush?.();
      assertOrigin();
      timing?.stage("Check storage identity");
      const exists = (await dependencies.store.list()).some((project) => project.id === input.id);
      const deleted = await dependencies.store.isDeleted(input.id);
      const project = exists || deleted ? { ...input, id: crypto.randomUUID() } : input;
      if (project !== input && input.replay)
        throw Error("A replay-bearing media project requires portable identity remapping.");
      assertOrigin();
      const reservation = engine.reserveTransaction([], { deferLock: true });
      try {
        timing?.stage("Prepare save: snapshot, validation + hashes");
        const prepared = await dependencies.store.prepareSave(project, undefined, {
          mediaOriginals: originals,
          requireAbsent: true,
          expectedRevision: "",
        });
        assertOrigin();
        reservation.lock();
        timing?.stage("Persist project atomically");
        await dependencies.store.persistPrepared(prepared);
        // A closed gallery never replaces the current editor, even if its durable write completed.
        // Native commit acknowledgement is the durability boundary; an aborted post-commit open
        // may leave a valid unused library entry, never a partially installed project.
        assertOrigin();
        reservation.cancel();
        timing?.stage("Publish document");
        engine.load(prepared.project);
        timing?.waitForFrame(engine.getSnapshot());
        dependencies.schedule?.(prepared.project);
      } finally {
        reservation.cancel();
      }
    } catch (error) {
      timing?.finish(options.signal?.aborted ? "cancelled" : "failed", error);
      throw error;
    }
  };
}
