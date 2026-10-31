import type { EnginePort } from "@musart/core";
import { previewComposition } from "./preview-composition";
import type { ExportPreviewOptions } from "../../state/contracts";
import type { ThumbnailPipeline } from "../projects/thumbnails";
import { SelectionPreviewIdentity } from "../projects/thumbnails/selection-identity";
import { THUMBNAIL_RENDER_VERSION } from "../projects/thumbnails/model";

/** A page-scoped preview never changes the editing page or publishes document state. */
export function createPreviewExport(
  engine: EnginePort,
  thumbnails: Pick<ThumbnailPipeline, "preview">,
  mediaResolverFor?: (projectId: string) => import("@musart/render").MediaSourceResolver,
) {
  const previewIdentities = new WeakMap<object, number>();
  const selectedPreviewIdentity = new SelectionPreviewIdentity();
  let previewIdentity = 0;
  const identity = (value: object) => {
    let id = previewIdentities.get(value);
    if (id === undefined) {
      id = ++previewIdentity;
      previewIdentities.set(value, id);
    }
    return id;
  };
  return async (options: ExportPreviewOptions, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const snapshot = engine.getSnapshot(),
      requestedPage = options.pageId,
      variant = options.variant ? { ...options.variant } : undefined,
      sourceId = requestedPage ?? snapshot.pageId,
      source = snapshot.project.pages.find((page) => page.id === sourceId);
    if (!source) throw new DOMException("Preview artboard is missing.", "AbortError");
    const ids = [
        ...new Set(options.selection ?? (sourceId === snapshot.pageId ? snapshot.selection : [])),
      ].sort(),
      edge = options.edge ?? 384;
    if (!Number.isInteger(edge) || edge < 16 || edge > 1024)
      throw new Error("Invalid preview size.");
    if (variant && (options.all || ids.length !== 1))
      throw new TypeError("Attachment previews require one selected layer.");
    const identityOptions = { includeDisabledMasks: variant?.kind === "mask" };
    const page =
      !options.all && ids.length
        ? previewComposition(
            source,
            ids,
            [
              snapshot.project.id,
              ...snapshot.project.pages.map((item) => item.id),
              ...Object.keys(snapshot.project.assets),
            ],
            variant,
          )
        : source;
    const appearance =
      !options.all && ids.length
        ? selectedPreviewIdentity.read(source, snapshot.project.assets, ids, identityOptions)
        : null;
    const key = JSON.stringify([
      THUMBNAIL_RENDER_VERSION,
      snapshot.project.id,
      source.id,
      appearance !== null ? appearance : [identity(source), identity(snapshot.project.assets)],
      options.all ? [] : ids,
      edge,
      variant ?? null,
      options.colorOutput ?? "display",
    ]);
    return thumbnails.preview(key, page, snapshot.project.assets, {
      edge,
      ...(options.colorOutput ? { colorOutput: options.colorOutput } : {}),
      ...(mediaResolverFor ? { mediaResolver: mediaResolverFor(snapshot.project.id) } : {}),
      ...(options.priority ? { priority: options.priority } : {}),
      ...(signal ? { signal } : {}),
      isCurrent: () => {
        const current = engine.getSnapshot();
        if (
          current.project.id !== snapshot.project.id ||
          (requestedPage === undefined && current.pageId !== snapshot.pageId)
        )
          return false;
        const currentPage = current.project.pages.find((candidate) => candidate.id === sourceId);
        if (!currentPage) return false;
        if (appearance !== null) {
          try {
            return (
              selectedPreviewIdentity.read(
                currentPage,
                current.project.assets,
                ids,
                identityOptions,
              ) === appearance
            );
          } catch {
            return false;
          }
        }
        return currentPage === source && current.project.assets === snapshot.project.assets;
      },
    });
  };
}
