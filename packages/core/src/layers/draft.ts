import type { Project } from "../document/model";
/** Layer patch handlers assign top-level fields; nested immutable resources remain shared. */
export function createLayerPatchDraft(
  project: Project,
  pageId: string,
  targets?: ReadonlySet<string>,
): Project {
  return {
    ...project,
    pages: project.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            layers: page.layers.map((layer) =>
              !targets || targets.has(layer.id) ? { ...layer } : layer,
            ),
          }
        : page,
    ),
  };
}
