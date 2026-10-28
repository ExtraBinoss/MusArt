import type { Command, EnginePort, Project, ReplaySpec } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import { getAnimationSession, type AnimationState } from "../animation/session";
import type { HistoryPage } from "../history/model";
import { readDataUrl } from "../assets/imports";
export interface AutomationApi {
  snapshot(): ReturnType<EnginePort["getSnapshot"]>;
  execute(command: Command): void;
  transaction(commands: Command[]): void;
  select(ids: string[]): void;
  page(id: string): void;
  load(project: Project): void;
  undo(): void;
  redo(): void;
  save(): Promise<void>;
  historyInfo: () => Promise<AnimationState>;
  historyConfigure: (options: { limit?: number; enabled?: boolean }) => Promise<void>;
  historyPage: (before?: number) => Promise<HistoryPage>;
  historyReplay: () => Promise<ReplaySpec>;
  flush: () => Promise<void>;
  flushThumbnails: () => Promise<void>;
  render(options?: {
    scale?: number;
    format?: "png" | "jpeg" | "webp";
    forceWebGL?: boolean;
  }): Promise<string>;
}
declare global {
  interface Window {
    musart?: AutomationApi;
  }
}
/** Opt-in local test/CLI port; it exposes the same validated commands as the editor. */
export function attachAutomation(engine: EnginePort, services: EditorServices) {
  const api: AutomationApi = {
    snapshot: () => structuredClone(engine.getSnapshot()),
    execute: engine.execute,
    transaction: engine.transaction,
    select: engine.select,
    page: engine.setPage,
    load: engine.load,
    undo: engine.undo,
    redo: engine.redo,
    save: () => services.saveProject(),
    historyConfigure: async (options) => {
      if (options.enabled !== undefined && typeof options.enabled !== "boolean")
        throw new TypeError("History enabled must be a boolean.");
      await getAnimationSession(engine).configure(options);
    },
    historyInfo: async () => {
      const session = getAnimationSession(engine);
      await session.flush();
      return structuredClone(session.read());
    },
    historyPage: async (before) => structuredClone(await getAnimationSession(engine).page(before)),
    historyReplay: async () => structuredClone(await getAnimationSession(engine).replay()),
    flush: () => getAnimationSession(engine).flush(),
    flushThumbnails: () => services.flushThumbnails(),
    async render(options = {}) {
      const { project, pageId } = engine.getSnapshot();
      const page = project.pages.find((page) => page.id === pageId)!;
      const { renderComposition, exportComposition } = await import("@musart/render");
      if (options.forceWebGL) {
        const canvas = await renderComposition(page, project.assets, {
          scale: options.scale,
          forceWebGL: true,
          ...(services.fonts ? { fontResolver: services.fonts.resolve } : {}),
        });
        return canvas.toDataURL(`image/${options.format ?? "png"}`);
      }
      return readDataUrl(
        await exportComposition(page, project.assets, {
          ...options,
          ...(services.fonts ? { fontResolver: services.fonts.resolve } : {}),
        }),
      );
    },
  };
  window.musart = api;
  return () => {
    if (window.musart === api) delete window.musart;
  };
}
