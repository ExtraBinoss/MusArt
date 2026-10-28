import type { Project } from "@musart/core";
import type { SearchItem, SearchTranslate } from "./model";

export function createDocumentSearchItems(project: Project, t: SearchTranslate): SearchItem[] {
  const pages: SearchItem[] = project.pages.map((item) => ({
    id: `page:${item.id}`,
    label: item.name,
    category: "pages",
    terms: `page composition ${item.width} ${item.height}`,
    detail: `${item.width} × ${item.height}`,
    target: { kind: "page", pageId: item.id },
  }));
  const kindLabels = new Map<string, string>();
  const kindLabel = (kind: string) => {
    let label = kindLabels.get(kind);
    if (label === undefined) {
      label = t(kind);
      kindLabels.set(kind, label);
    }
    return label;
  };
  const layers: SearchItem[] = project.pages.flatMap((item) => {
    const details = new Map<string, string>();
    const detail = (kind: string) => {
      let label = details.get(kind);
      if (label === undefined) {
        label = t("search:onPage", { kind: kindLabel(kind), page: item.name });
        details.set(kind, label);
      }
      return label;
    };
    return [...item.layers].reverse().map((layer): SearchItem => ({
      id: `layer:${item.id}:${layer.id}`,
      label: layer.name,
      category: "layers",
      terms: `layer calque ${layer.kind} ${kindLabel(layer.kind)} ${item.name} ${layer.text ?? ""}`,
      detail: detail(layer.kind),
      target: { kind: "layer", pageId: item.id, layerId: layer.id },
    }));
  });
  return [...pages, ...layers];
}
