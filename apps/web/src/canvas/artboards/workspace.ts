import type { EnginePort, Project } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { arrangeArtboards, viewForArtboard } from "./layout";

export function createWorkspace(engine: EnginePort, controller: SceneController) {
  let signature = "",
    cached = arrangeArtboards([]);
  let previousProject: Project | null = null,
    previousId = "",
    previousName = "",
    previousWidth = 0,
    previousHeight = 0;
  const read = () => {
    const page = controller.read().page;
    const snapshot = engine.getSnapshot();
    if (
      snapshot.project === previousProject &&
      snapshot.pageId === previousId &&
      page.name === previousName &&
      page.width === previousWidth &&
      page.height === previousHeight
    )
      return cached;
    previousProject = snapshot.project;
    previousId = snapshot.pageId;
    previousName = page.name;
    previousWidth = page.width;
    previousHeight = page.height;
    const pages = snapshot.project.pages.map((item) => ({
      id: item.id,
      name: item.id === snapshot.pageId ? page.name : item.name,
      width: item.id === snapshot.pageId ? page.width : item.width,
      height: item.id === snapshot.pageId ? page.height : item.height,
    }));
    const next = JSON.stringify(pages);
    if (signature !== next) {
      signature = next;
      cached = arrangeArtboards(pages);
    }
    return cached;
  };
  return { read, activeId: () => engine.getSnapshot().pageId };
}
export type WorkspaceSource = ReturnType<typeof createWorkspace>;

export function createArtboardView(workspace: WorkspaceSource, source: ViewSource): ViewSource {
  return {
    read: () => {
      const layout = workspace.read();
      return viewForArtboard(
        source.read(),
        layout,
        layout.boards.find((board) => board.id === workspace.activeId())!,
      );
    },
    subscribe: source.subscribe,
  };
}
