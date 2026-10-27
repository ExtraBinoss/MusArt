import { createLayer, createPage, createProject } from "../../src/document/factories";
import { EditorEngine } from "../../src/session/engine";
import type { Layer, Asset } from "../../src/document/model";
export function setup(layers: Layer[] = []) {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ id: "page", width: 1000, height: 800, layers })] }),
  );
  return {
    engine,
    page: () =>
      engine.getSnapshot().project.pages.find((page) => page.id === engine.getSnapshot().pageId)!,
    layer: (id: string) =>
      engine
        .getSnapshot()
        .project.pages.flatMap((page) => page.layers)
        .find((layer) => layer.id === id)!,
  };
}
export function box(id: string, x = 0, y = 0, patch: Partial<Layer> = {}) {
  return createLayer("rectangle", { id, x, y, width: 100, height: 80, ...patch });
}
export function asset(id = "original", dataUrl = "data:image/png;base64,AAAA"): Asset {
  return { id, name: "Photo", mime: "image/png", width: 10, height: 10, dataUrl };
}
