import type { Composition, Layer, Project } from "@musart/core";
import { projectLayerTree, type LayerTreeEntry } from "./projection";

export type ProjectTreeEntry =
  | { kind: "artboard"; key: string; page: Composition; expanded: boolean }
  | { kind: "empty"; key: string; page: Composition }
  | (LayerTreeEntry & { page: Composition });

/** One flat virtual window covers every artboard; activation does not rebuild its hierarchy. */
export function projectLayerWorkspace(
  project: Project,
  collapsedPages: ReadonlySet<string>,
  collapsedLayers: ReadonlySet<string>,
  attachments: ReadonlySet<string>,
  preview?: { pageId: string; layers: Layer[]; inside?: string },
): ProjectTreeEntry[] {
  const entries: ProjectTreeEntry[] = [];
  for (const page of project.pages) {
    const expanded = !collapsedPages.has(page.id) || preview?.pageId === page.id;
    entries.push({ kind: "artboard", key: `artboard:${page.id}`, page, expanded });
    if (!expanded) continue;
    if (!page.layers.length) entries.push({ kind: "empty", key: `empty:${page.id}`, page });
    const drag = preview?.pageId === page.id ? preview : undefined;
    for (const entry of projectLayerTree(
      drag?.layers ?? page.layers,
      collapsedLayers,
      attachments,
      drag?.inside,
    )) {
      const identity =
        entry.kind === "effect"
          ? `${entry.layer.id.length}:${entry.layer.id}:${entry.effectId}`
          : entry.layer.id;
      entries.push({ ...entry, key: `${entry.kind}:${identity}`, depth: entry.depth + 1, page });
    }
  }
  return entries;
}
