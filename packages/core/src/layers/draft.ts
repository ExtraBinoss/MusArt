import type { Project } from "../document/model";
/** Layer patch handlers assign top-level fields; nested immutable resources remain shared. */
export function createLayerPatchDraft(project: Project, pageId: string): Project {
  return {
    ...project,
    pages: project.pages.map((page) =>
      page.id === pageId ? { ...page, layers: page.layers.map((layer) => ({ ...layer })) } : page,
    ),
  };
}
