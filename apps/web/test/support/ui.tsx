import { Provider, createStore } from "jotai";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { EditorEngine, createLayer, createPage, createProject } from "@musart/core";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import type { EditorServices } from "../../src/state/contracts";
import { i18n } from "../../src/state/i18n";

export function setup() {
  void i18n.changeLanguage("fr");
  const rectangle = createLayer("rectangle", {
    name: "Rectangle bleu",
    fill: "#3366ff",
    x: 20,
    y: 30,
    width: 200,
    height: 100,
  });
  const text = createLayer("text", {
    name: "Titre",
    text: "Bonjour",
    fontFamily: "Inter",
    x: 30,
    y: 50,
  });
  const image = createLayer("image", { name: "Photo", assetId: "asset1" });
  const page = createPage({
    name: "Affiche",
    width: 1080,
    height: 1080,
    layers: [rectangle, text, image],
  });
  const project = createProject({
    name: "Atelier",
    pages: [page],
    assets: {
      asset1: {
        id: "asset1",
        name: "Photo",
        mime: "image/png",
        width: 100,
        height: 100,
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      },
    },
  });
  const engine = new EditorEngine(project);
  const store = createStore();
  const services: EditorServices = {
    listProjects: vi.fn().mockResolvedValue([]),
    listProjectPage: vi.fn(async () => ({ projects: await services.listProjects(), before: null })),
    renameProject: vi.fn().mockResolvedValue(undefined),
    projectInsights: vi.fn().mockResolvedValue({
      projectId: project.id,
      basis: "logical-utf8",
      bytes: {
        manifest: 100,
        assets: 1000,
        thumbnails: 100,
        historyEvents: 200,
        historyAssets: 300,
        historyBase: 100,
        historyMetadata: 50,
        total: 1850,
      },
      history: { count: 2, limit: 10000, enabled: true },
    }),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    flushThumbnails: vi.fn().mockResolvedValue(undefined),
    loadProjectThumbnails: vi.fn().mockResolvedValue({ items: [], release: vi.fn() }),
    subscribeProjectThumbnails: vi.fn(() => () => undefined),
    openProject: vi.fn().mockResolvedValue(undefined),
    createProject: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    duplicateProject: vi.fn().mockResolvedValue(undefined),
    importFiles: vi.fn().mockResolvedValue(undefined),
    openPortable: vi.fn().mockResolvedValue(undefined),
    exportProject: vi.fn().mockResolvedValue(undefined),
    exportImage: vi.fn().mockResolvedValue(undefined),
    selectImagePoint: vi.fn().mockResolvedValue(undefined),
    prepareSegmentation: vi.fn().mockResolvedValue(undefined),
  };
  const run = vi.fn((action: () => void) => action());
  const onTask = vi.fn(async (action: () => void | Promise<void>) => {
    try {
      await action();
      return true;
    } catch {
      return false;
    }
  });
  function mount(node: ReactNode) {
    return render(node, {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
        </Provider>
      ),
    });
  }
  return { rectangle, text, image, page, project, engine, store, services, run, onTask, mount };
}
