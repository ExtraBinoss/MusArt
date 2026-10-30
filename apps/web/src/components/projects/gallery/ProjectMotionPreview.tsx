import { useCallback, type ReactNode } from "react";
import type { EditorServices } from "../../../state/contracts";
import { MotionPreviewSurface } from "../templates/motion-preview/MotionPreviewSurface";
import { startMotionPreview, type PreviewStatus } from "../templates/motion-preview/runtime";

/** Reading a saved project for hover never replaces the current editor or installs a document. */
export function ProjectMotionPreview({
  projectId,
  pageId,
  services,
  poster,
  disabled,
  children,
}: {
  projectId: string;
  pageId: string;
  services: EditorServices;
  poster?: string;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const start = useCallback(
    (host: HTMLElement, onStatus: (status: PreviewStatus, error?: unknown) => void) =>
      startMotionPreview({
        host,
        onStatus,
        prepare: async (signal) => {
          if (!services.loadProjectPreview)
            throw new Error("Saved project previews are unavailable.");
          const project = await services.loadProjectPreview(projectId, { signal });
          signal.throwIfAborted();
          if (!project.pages.some((page) => page.id === pageId))
            throw new Error("This saved artboard is no longer available.");
          return {
            project,
            compositionId: pageId,
            mediaResolver: services.mediaResolverFor?.(projectId),
            fontResolver: services.fonts?.resolve,
          };
        },
      }),
    [services, projectId, pageId],
  );
  return (
    <MotionPreviewSurface
      startPreview={start}
      poster={poster}
      disabled={disabled}
      className="motion-project-preview"
    >
      {children}
    </MotionPreviewSurface>
  );
}
