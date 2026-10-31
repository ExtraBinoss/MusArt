import { brand } from "../../ui/brand/config";
import { createExportArchive } from "./archive";
import { selectionComposition, type EnginePort, type EditorEngine } from "@musart/core";
import type { FontResolver, MediaSourceResolver } from "@musart/render";
import { downloadBlob, safeName } from "../files/download";
import { ExportScopeError } from "../session/export-scope";
import type {
  CompositionExportOptions,
  CompositionExportResult,
  CompositionExportScope,
} from "./model";

/** Platform delivery wraps the same generic renderer used by non-editor callers. */
export function createCompositionExporter(
  engine: EnginePort,
  dependencies: {
    render?: () => Promise<
      Pick<typeof import("@musart/render"), "exportComposition" | "exportMotionVideo"> &
        Partial<
          Pick<
            typeof import("@musart/render"),
            "encodeManagedImage" | "printComposition" | "DEFAULT_PRINT"
          >
        >
    >;
    download?: typeof downloadBlob;
    mediaResolverFor: (projectId: string) => MediaSourceResolver;
    fontResolver?: FontResolver;
  },
) {
  return async (
    options: CompositionExportOptions,
    scope: CompositionExportScope,
  ): Promise<CompositionExportResult> => {
    options.signal?.throwIfAborted();
    const snapshot = engine.getSnapshot(),
      project = snapshot.project;
    const page = project.pages.find((item) => item.id === options.compositionId);
    if (
      !page ||
      project.id !== scope.projectId ||
      options.compositionId !== scope.compositionId ||
      snapshot.revision !== scope.revision ||
      page !== scope.page ||
      (options.mode === "motion" && page.motion?.mode !== "motion")
    )
      throw new ExportScopeError();
    let replaced = false;
    const observer = engine as EnginePort &
      Partial<Pick<EditorEngine, "subscribeCommitInfo" | "subscribeCommands">>;
    const stop = options.background
      ? (observer.subscribeCommitInfo?.((event) => {
          if (event.kind === "load") replaced = true;
        }) ??
        observer.subscribeCommands?.((event) => {
          if (event.kind === "load") replaced = true;
        }))
      : undefined;
    try {
      const renderer = await (dependencies.render ?? (() => import("@musart/render")))();
      options.signal?.throwIfAborted();
      const mediaResolver = dependencies.mediaResolverFor(project.id);
      let blob: Blob, filename: string;
      let width = Math.max(1, Math.round(page.width * options.scale));
      let height = Math.max(1, Math.round(page.height * options.scale));
      if (options.mode === "motion") {
        await options.beforeFrame?.();
        const result = await renderer.exportMotionVideo(project, {
          compositionId: page.id,
          selection: options.selection,
          beforeFrame: options.beforeFrame,
          scale: options.scale,
          container: options.container,
          frameRate: options.frameRate,
          videoBitrate: options.videoBitrate,
          audioBitrate: options.audioBitrate,
          audio: options.audio === false ? false : {},
          mediaResolver,
          fontResolver: dependencies.fontResolver,
          signal: options.signal,
          onProgress: (progress) => options.onProgress?.(progress.fraction),
        });
        if (!result.blob || result.bytes < 1)
          throw new Error("The video encoder produced no file.");
        blob = result.blob;
        filename = safeName(page.name) + (result.mimeType === "video/mp4" ? ".mp4" : ".webm");
        width = result.width;
        height = result.height;
      } else {
        const ids = [...(options.selection ?? [])];
        if (ids.some((id) => !page.layers.some((layer) => layer.id === id)))
          throw new ExportScopeError();
        const pages = options.image.allPages
          ? project.pages
          : [
              options.image.selectionOnly && ids.length
                ? selectionComposition(page, ids, [
                    project.id,
                    ...project.pages.map((item) => item.id),
                    ...Object.keys(project.assets),
                  ])
                : page,
            ];
        const files: Record<string, Uint8Array> = {};
        let single: Blob | undefined;
        let totalBytes = 0;
        for (const [index, item] of pages.entries()) {
          options.signal?.throwIfAborted();
          await options.beforeFrame?.();
          const managed =
            options.image.colorMode !== undefined ||
            options.image.format === "pdf" ||
            options.image.format === "tiff";
          const print = options.image.print ?? renderer.DEFAULT_PRINT;
          if (managed && (!renderer.encodeManagedImage || !print))
            throw new Error("Managed image encoding is unavailable.");
          const printable =
            options.image.format === "pdf" && renderer.printComposition
              ? renderer.printComposition(item, print!)
              : item;
          let encoded = await renderer.exportComposition(printable, project.assets, {
            ...options.image,
            format: managed ? "png" : (options.image.format as "png" | "jpeg" | "webp"),
            scale: options.scale,
            mediaResolver,
            fontResolver: dependencies.fontResolver,
            signal: options.signal,
          });
          if (managed)
            encoded = await renderer.encodeManagedImage!(
              {
                blob: encoded,
                options: {
                  format: options.image.format,
                  colorMode: options.image.colorMode ?? "srgb",
                  quality: options.image.quality,
                  print: print!,
                },
                width: Math.max(1, Math.round(item.width * options.scale)),
                height: Math.max(1, Math.round(item.height * options.scale)),
                name: item.name,
                creator: brand.name,
              },
              options.signal,
            );
          if (!encoded.size) throw new Error("The renderer produced an empty file.");
          totalBytes += encoded.size;
          if (options.image.allPages && totalBytes > 128 * 1024 * 1024)
            throw new Error("The artboard archive exceeds the 128 MiB export limit.");
          const name =
            safeName(item.name) +
            "." +
            (options.image.format === "jpeg" ? "jpg" : options.image.format);
          if (!options.image.allPages) {
            single = encoded;
            filename = name;
            width = Math.max(1, Math.round(item.width * options.scale));
            height = Math.max(1, Math.round(item.height * options.scale));
          } else
            files[String(index + 1).padStart(2, "0") + "-" + name] = new Uint8Array(
              await encoded.arrayBuffer(),
            );
          options.onProgress?.((index + 1) / pages.length);
        }
        if (single) blob = single;
        else {
          blob = await createExportArchive(files, options.signal);
          filename = safeName(project.name) + ".zip";
        }
      }
      options.signal?.throwIfAborted();
      if (
        replaced ||
        (options.background && (observer.subscribeCommitInfo || observer.subscribeCommands)
          ? engine.getSnapshot().project.id !== project.id
          : engine.getSnapshot().project !== project)
      )
        throw new ExportScopeError();
      if (!blob.size) throw new Error("The renderer produced an empty file.");
      (dependencies.download ?? downloadBlob)(blob, filename!);
      return {
        mode: options.mode,
        filename: filename!,
        mimeType: blob.type,
        bytes: blob.size,
        width,
        height,
      };
    } finally {
      stop?.();
    }
  };
}
